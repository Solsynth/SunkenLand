import { CONFIG_EVENT, getConfig } from "./config";
import { ApiClient } from "./api/client";
import { AccountApi } from "./api/account";
import type { SnAccount } from "./api/schemas";
import {
  DEFAULT_OIDC_ISSUER,
  DEFAULT_OIDC_SCOPES,
  buildAuthorizeUrl,
  createOidcNonce,
  createOidcState,
  createPkcePair,
  defaultRedirectUri,
  discoverOidc,
  exchangeOidcCode,
  fetchOidcUserInfo,
  refreshOidcToken,
  type OidcDiscovery,
  type OidcTokenResponse,
} from "./oidc";
import {
  AUTH_ERROR_EVENT,
  SIGNIN_EVENT,
  SIGNOUT_EVENT,
  dispatchWindowEvent,
} from "./events";

/**
 * OAuth / OIDC session state for embedded hosts.
 *
 * Authentication is OpenID Connect against the platform identity provider
 * (Solarpass): `signInWithOidc()` opens the provider's authorization page in a
 * **popup**, using authorization code + PKCE (no secret in the browser), and
 * the popup relays the code back to this window. Nothing is server-mediated,
 * so it works from any host page.
 *
 * The session persists the token pair in pluggable storage (localStorage by
 * default) and provides the API client's token hooks, so elements and
 * `apiFetch` are authenticated automatically; refreshes use the provider's
 * `refresh_token` grant.
 *
 * State transitions broadcast on `window` (see `src/events.ts`):
 *   - `sunkenland:signin`      detail = { user }
 *   - `sunkenland:signout`
 *   - `sunkenland:auth-error`  detail = { error }
 */

export interface SessionStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const SESSION_STORAGE_KEY = "sunkenland:session";
export const PENDING_AUTH_KEY = "sunkenland:oidc-pending";

/** Message the redirect-popup sends to the opener. */
export const OIDC_MESSAGE_TYPE = "sunkenland:oidc-callback";

/** Popup window features (centered-ish, provider-page sized). */
const POPUP_FEATURES = "width=480,height=680,menubar=no,toolbar=no,location=yes";

/** How long a pending sign-in (and its popup) stays valid. */
const PENDING_TTL_MS = 10 * 60 * 1000;

/** localStorage-backed storage (the default). Guards for SSR / privacy modes. */
export const localStorageSessionStorage: SessionStorage = {
  get: (key) =>
    typeof localStorage === "undefined" ? null : localStorage.getItem(key),
  set: (key, value) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  remove: (key) => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

/** Fresh in-memory storage — useful for tests and privacy-first hosts. */
export function inMemorySessionStorage(): SessionStorage {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
    },
    remove: (key) => {
      map.delete(key);
    },
  };
}

export type SessionState = "signed-out" | "signed-in" | "loading";

export interface SessionSnapshot {
  state: SessionState;
  user: SnAccount | null;
  error: string | null;
}

/** OIDC defaults hosts can set once with `configure({ oidc })`. */
export interface OidcDefaults {
  clientId?: string;
  issuer?: string;
  redirectUri?: string;
  scopes?: string[];
  /** `popup` (default) keeps the host page; `redirect` navigates away. */
  mode?: "popup" | "redirect";
}

export interface SignInWithOidcOptions extends OidcDefaults {
  /** Confidential clients only — browsers should rely on PKCE instead. */
  clientSecret?: string;
  /** Extra authorization parameters (e.g. `prompt`, `login_hint`). */
  extra?: Record<string, string>;
}

interface TokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  idToken?: string;
  /** Present when the pair was issued by the OIDC client flow. */
  oidc?: { issuer: string; clientId: string; redirectUri: string };
}

/** Persisted shape — one JSON blob under `SESSION_STORAGE_KEY`. */
interface PersistedSession extends TokenPair {
  user?: SnAccount | null;
}

/** In-flight authorization request (survives the redirect in storage). */
interface PendingAuth {
  state: string;
  verifier: string;
  nonce: string;
  clientId: string;
  issuer: string;
  redirectUri: string;
  scopes: string[];
  mode: "popup" | "redirect";
  createdAt: number;
}

export class SunkenLandSession {
  readonly #storage: SessionStorage;
  #tokens: TokenPair | null = null;
  #user: SnAccount | null = null;
  #state: SessionState = "signed-out";
  #error: string | null = null;
  #completing: Promise<SessionSnapshot> | null = null;
  #popup: Window | null = null;
  #awaitingPopup: {
    resolve: (snapshot: SessionSnapshot) => void;
    poll: ReturnType<typeof setInterval>;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;
  #listening = false;
  #provisioned = false;
  readonly #listeners = new Set<(snapshot: SessionSnapshot) => void>();

  constructor(options: { storage?: SessionStorage } = {}) {
    this.#storage = options.storage ?? localStorageSessionStorage;
    this.#restore();
    // A host may configure its token before or after elements mount.
    if (typeof window !== "undefined") {
      window.addEventListener(CONFIG_EVENT, this.#onConfigChange);
    }
  }

  get state(): SessionState {
    return this.#state;
  }

  get user(): SnAccount | null {
    return this.#user;
  }

  get error(): string | null {
    return this.#error;
  }

  get isSignedIn(): boolean {
    return this.#state === "signed-in";
  }

  snapshot(): SessionSnapshot {
    return { state: this.#state, user: this.#user, error: this.#error };
  }

  /**
   * Subscribe to session changes. The listener is invoked immediately with the
   * current snapshot and again after every transition. Returns an unsubscribe
   * function.
   */
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => this.#listeners.delete(listener);
  }

  // ── Token hooks (feed these to `ApiClient` / `configure`) ───────────────

  /**
   * Current access token. Precedence: a token the host gave us (either
   * `configure({ token })` or `configure({ getAccessToken })`) wins over the
   * one this session obtained through sign-in.
   */
  getAccessToken = ():
    | string
    | null
    | Promise<string | null> => {
    const cfg = getConfig();
    if (cfg.token) return cfg.token;
    if (cfg.getAccessToken) return cfg.getAccessToken();
    return this.#tokens?.accessToken ?? null;
  };

  /**
   * True when the credential is owned by the host (a configured token or
   * token provider) rather than by this session's sign-in. The elements hide
   * Sign out in that case — the host manages the credential's lifetime.
   */
  get externallyProvisioned(): boolean {
    const cfg = getConfig();
    return Boolean(cfg.token || cfg.getAccessToken);
  }

  /**
   * Refresh the token pair (OIDC `refresh_token` grant). Returns the new
   * access token so the API client can retry, or null on failure — which also
   * signs the session out. A host-provisioned token cannot be refreshed; the
   * host is expected to supply a fresh one.
   */
  refreshAccessToken = async (): Promise<string | null> => {
    if (this.externallyProvisioned) return null;
    const current = this.#tokens;
    const refreshToken = current?.refreshToken;
    if (!current || !refreshToken) return null;
    if (!current.oidc) {
      // Tokens from before the OIDC-only build cannot be refreshed.
      await this.signOut({ api: false });
      return null;
    }
    try {
      const cfg = getConfig();
      const discovery = await discoverOidc(current.oidc.issuer, cfg.fetchImpl);
      const issued = await refreshOidcToken(
        discovery,
        { clientId: current.oidc.clientId, refreshToken },
        cfg.fetchImpl,
      );
      this.#applyToken(issued, current.oidc);
      this.#persist();
      return this.#tokens?.accessToken ?? null;
    } catch {
      await this.signOut({ api: false });
      return null;
    }
  };

  /** Client callback for a request that failed auth even after refresh. */
  onUnauthorized = (): void => {
    void this.signOut({ api: false });
  };

  /**
   * Adopt a host-provisioned credential (`configure({ token })` or
   * `configure({ getAccessToken })`) so the elements can render the signed-in
   * state without the visitor using the login button. Idempotent; called by
   * the elements on mount and whenever `configure` runs.
   */
  async syncProvisioned(): Promise<SessionSnapshot> {
    if (!this.externallyProvisioned) {
      if (this.#provisioned) {
        // The host withdrew its credential.
        this.#provisioned = false;
        this.#tokens = null;
        this.#user = null;
        this.#error = null;
        this.#setState("signed-out");
      }
      return this.snapshot();
    }
    const cfg = getConfig();
    const token = cfg.token ?? (await cfg.getAccessToken?.()) ?? null;
    if (!token) return this.snapshot();
    if (this.#provisioned && this.#user && this.#tokens?.accessToken === token) {
      return this.snapshot();
    }
    this.#provisioned = true;
    this.#tokens = { accessToken: token, oidc: undefined };
    try {
      this.#user = await this.#resolveUser();
      this.#error = null;
      this.#setState("signed-in");
    } catch (err) {
      this.#user = null;
      this.#error =
        err instanceof Error
          ? `The configured access token was rejected: ${err.message}`
          : "The configured access token was rejected.";
      this.#setState("signed-out");
      this.#emit(AUTH_ERROR_EVENT, { error: this.#error });
    }
    return this.snapshot();
  }

  // ── Solarpass / OIDC sign-in ────────────────────────────────────────────

  /**
   * Sign in through the platform identity provider (OpenID Connect,
   * authorization code + PKCE).
   *
   * `mode: "popup"` (default) opens the provider in a popup window and
   * resolves once the popup relays the authorization code back — the host page
   * is never navigated. `mode: "redirect"` navigates this page instead; the
   * result is then completed by `resumeAuth()` on the way back.
   *
   * Resolves with the resulting snapshot. User-level outcomes (cancelled
   * popup, provider denial, failed exchange) land in `error`/`state` and emit
   * `sunkenland:auth-error`; only configuration errors (missing client id,
   * discovery failure) reject.
   */
  async signInWithOidc(
    options: SignInWithOidcOptions = {},
  ): Promise<SessionSnapshot> {
    const cfg = getConfig();
    const clientId = options.clientId ?? cfg.oidc?.clientId;
    if (!clientId) {
      throw new Error(
        "OIDC client id is required: pass client-id / `configure({ oidc: { clientId } })`. " +
          "Register an app (client id + redirect URI) with the provider first.",
      );
    }
    const issuer = options.issuer ?? cfg.oidc?.issuer ?? DEFAULT_OIDC_ISSUER;
    const redirectUri =
      options.redirectUri ?? cfg.oidc?.redirectUri ?? defaultRedirectUri();
    const scopes =
      options.scopes ?? cfg.oidc?.scopes ?? [...DEFAULT_OIDC_SCOPES];
    const mode = options.mode ?? cfg.oidc?.mode ?? "popup";

    const discovery = await discoverOidc(issuer, cfg.fetchImpl);
    const { verifier, challenge } = await createPkcePair();
    const state = createOidcState();
    const nonce = createOidcNonce();

    this.#savePending({
      state,
      verifier,
      nonce,
      clientId,
      issuer,
      redirectUri,
      scopes,
      mode,
      createdAt: Date.now(),
    });

    const authorizeUrl = buildAuthorizeUrl(discovery, {
      clientId,
      redirectUri,
      scopes,
      state,
      nonce,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      extra: options.extra,
    });

    if (mode === "redirect" || typeof window === "undefined") {
      window.location.assign(authorizeUrl);
      return this.snapshot();
    }

    this.#setState("loading");
    const popup = window.open(authorizeUrl, "sunkenland-oidc", POPUP_FEATURES);
    if (!popup) {
      // Popup blocked: fall back to a full-page redirect rather than dead-end.
      window.location.assign(authorizeUrl);
      return this.snapshot();
    }
    popup.focus?.();
    this.#popup = popup;
    this.#listenForCallback();
    return this.#awaitPopupResult();
  }

  /**
   * Complete any in-flight authentication for this page load. Call once per
   * page from each element (idempotent):
   *
   * - a popup that landed on the redirect URI relays its code to the opener
   *   and closes;
   * - a page (or opener) holding a `code` completes the OIDC exchange;
   * - a legacy provider callback is completed through the backend.
   */
  async resumeAuth(url: string | URL = window.location.href): Promise<SessionSnapshot> {
    if (this.#relayPopupCallback(url)) return this.snapshot();

    const parsed = typeof url === "string" ? new URL(url, window.location.href) : url;
    const pending = this.#loadPending();
    const hasCode = parsed.searchParams.has("code") || parsed.searchParams.has("error");
    if (pending && hasCode) {
      return this.#completeOidc(parsed, pending);
    }
    if (pending && pending.mode === "redirect" && !hasCode) {
      // Came back without a code — the user abandoned the provider page.
      this.#clearPending();
    }
    return this.snapshot();
  }

  /**
   * Relay a callback that landed in the popup to the opener (then close the
   * popup). Returns true when this page was such a relay.
   */
  #relayPopupCallback(url: string | URL): boolean {
    if (typeof window === "undefined" || !window.opener) return false;
    const parsed = typeof url === "string" ? new URL(url, window.location.href) : url;
    const code = parsed.searchParams.get("code");
    const error = parsed.searchParams.get("error");
    if (!code && !error) return false;

    window.opener.postMessage(
      {
        type: OIDC_MESSAGE_TYPE,
        code,
        error,
        errorDescription: parsed.searchParams.get("error_description"),
        state: parsed.searchParams.get("state"),
      },
      window.location.origin,
    );
    if (parsed.origin === window.location.origin) this.#cleanUrl(parsed);
    window.close();
    return true;
  }

  /** Exchange the authorization code from an OIDC callback. */
  async #completeOidc(parsed: URL, pending: PendingAuth): Promise<SessionSnapshot> {
    if (this.#completing) return this.#completing;
    const state = parsed.searchParams.get("state");
    const errorParam = parsed.searchParams.get("error");

    if (errorParam) {
      this.#clearPending();
      this.#failOidc(
        parsed.searchParams.get("error_description") || errorParam,
      );
      return this.snapshot();
    }
    if (state !== pending.state) {
      this.#clearPending();
      this.#failOidc("OIDC state mismatch — the response could not be verified.");
      return this.snapshot();
    }

    this.#setState("loading");
    this.#completing = (async () => {
      try {
        const cfg = getConfig();
        const discovery = await discoverOidc(pending.issuer, cfg.fetchImpl);
        const issued = await exchangeOidcCode(
          discovery,
          {
            clientId: pending.clientId,
            code: parsed.searchParams.get("code") ?? "",
            redirectUri: pending.redirectUri,
            codeVerifier: pending.verifier,
          },
          cfg.fetchImpl,
        );
        this.#applyToken(issued, {
          issuer: pending.issuer,
          clientId: pending.clientId,
          redirectUri: pending.redirectUri,
        });
        this.#user = await this.#resolveUser(discovery);
        this.#error = null;
        this.#persist();
        this.#clearPending();
        if (parsed.origin === window.location.origin) this.#cleanUrl(parsed);
        this.#emit(SIGNIN_EVENT, { user: this.#user });
      } catch (err) {
        this.#tokens = null;
        this.#user = null;
        this.#failOidc(err instanceof Error ? err.message : "Sign-in failed.");
      } finally {
        this.#completing = null;
        this.#setState(this.#user ? "signed-in" : "signed-out");
      }
      return this.snapshot();
    })();
    return this.#completing;
  }

  #failOidc(message: string): void {
    this.#tokens = null;
    this.#user = null;
    this.#error = message;
    this.#setState("signed-out");
    this.#emit(AUTH_ERROR_EVENT, { error: message });
  }

  /**
   * Resolve the signed-in account: prefer the API's account endpoint (richer
   * profile data), fall back to OIDC userinfo claims.
   *
   * Uses a probe client without refresh/onUnauthorized: a 401 here means "this
   * token isn't accepted by the account API", which must not tear the session
   * down — the OIDC token is still perfectly valid for userinfo.
   */
  async #resolveUser(discovery?: OidcDiscovery): Promise<SnAccount> {
    const cfg = getConfig();
    const probe = new AccountApi(
      new ApiClient({
        baseUrl: cfg.baseUrl,
        fetchImpl: cfg.fetchImpl,
        getAccessToken: this.getAccessToken,
      }),
    );
    try {
      return await probe.getUserInfo();
    } catch (err) {
      const token = this.#tokens?.accessToken;
      if (!token) throw err;
      const doc =
        discovery ??
        (await discoverOidc(
          this.#tokens?.oidc?.issuer ?? DEFAULT_OIDC_ISSUER,
          cfg.fetchImpl,
        ));
      const info = await fetchOidcUserInfo(doc, token, cfg.fetchImpl);
      // userinfo: `name` is the handle, `preferred_username` the display name
      // (mirrors the provider's own mapping).
      const name = info.name ?? info.preferredUsername ?? info.sub;
      return { id: info.sub, name, nick: info.preferredUsername ?? info.name };
    }
  }

  /** Wait for the popup to relay its result (or be closed by the user). */
  #awaitPopupResult(): Promise<SessionSnapshot> {
    const { promise, resolve } = Promise.withResolvers<SessionSnapshot>();
    const settle = (snapshot: SessionSnapshot) => {
      if (!this.#awaitingPopup) return;
      clearInterval(this.#awaitingPopup.poll);
      clearTimeout(this.#awaitingPopup.timeout);
      this.#awaitingPopup = null;
      resolve(snapshot);
    };
    const poll = setInterval(() => {
      // The popup reports back via postMessage; closing it means cancellation.
      if (this.#popup?.closed) {
        this.#clearPending();
        this.#setState(this.#user ? "signed-in" : "signed-out");
        settle(this.snapshot());
      }
    }, 500);
    const timeout = setTimeout(() => {
      this.#clearPending();
      this.#setState(this.#user ? "signed-in" : "signed-out");
      settle(this.snapshot());
    }, PENDING_TTL_MS);
    this.#awaitingPopup = { resolve: settle, poll, timeout };
    return promise;
  }

  #listenForCallback(): void {
    if (this.#listening || typeof window === "undefined") return;
    this.#listening = true;
    window.addEventListener("message", this.#onMessage);
  }

  #onMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as
      | { type?: string; code?: string; error?: string; errorDescription?: string; state?: string }
      | null;
    if (!data || data.type !== OIDC_MESSAGE_TYPE) return;
    const pending = this.#loadPending();
    if (!pending) return;
    if (data.state !== pending.state) {
      this.#clearPending();
      this.#failOidc("OIDC state mismatch — the response could not be verified.");
    } else if (data.error) {
      this.#clearPending();
      this.#failOidc(data.errorDescription || data.error);
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set("code", data.code ?? "");
      url.searchParams.set("state", data.state ?? "");
      void this.#completeOidc(url, pending).then((snapshot) => {
        this.#awaitingPopup?.resolve(snapshot);
      });
      return;
    }
    this.#awaitingPopup?.resolve(this.snapshot());
  };

  /**
   * Sign out: best-effort revokes the server session, clears local tokens and
   * the account, and broadcasts `sunkenland:signout`.
   */
  async signOut(_options: { api?: boolean } = {}): Promise<void> {
    // OIDC tokens are dropped client-side: the provider advertises no
    // revocation endpoint (and no server session is held for us).
    if (this.externallyProvisioned) {
      // The host owns the credential — clear local state, not theirs.
      this.#provisioned = false;
      this.#user = null;
      this.#error = null;
      this.#setState("signed-out");
      this.#emit(SIGNOUT_EVENT);
      void this.syncProvisioned();
      return;
    }
    this.#clearPending();
    this.#tokens = null;
    this.#user = null;
    this.#error = null;
    this.#setState("signed-out");
    this.#persist();
    this.#emit(SIGNOUT_EVENT);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  #restore(): void {
    const raw = this.#storage.get(SESSION_STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as PersistedSession;
      if (!data?.accessToken) {
        this.#storage.remove(SESSION_STORAGE_KEY);
        return;
      }
      this.#tokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        idToken: data.idToken,
        oidc: data.oidc,
      };
      this.#user = data.user ?? null;
      this.#state = this.#user ? "signed-in" : "signed-out";
    } catch {
      this.#storage.remove(SESSION_STORAGE_KEY);
    }
  }

  #applyToken(
    pair: OidcTokenResponse,
    oidc: { issuer: string; clientId: string; redirectUri: string },
  ): void {
    this.#tokens = {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresAt: pair.expiresIn
        ? new Date(Date.now() + pair.expiresIn * 1000).toISOString()
        : undefined,
      idToken: pair.idToken,
      oidc,
    };
  }

  #persist(): void {
    if (this.#provisioned) {
      // The host owns this credential; keep it out of session storage.
      return;
    }
    if (!this.#tokens) {
      this.#storage.remove(SESSION_STORAGE_KEY);
      return;
    }
    const data: PersistedSession = {
      ...this.#tokens,
      user: this.#user ?? null,
    };
    this.#storage.set(SESSION_STORAGE_KEY, JSON.stringify(data));
  }

  #savePending(pending: PendingAuth): void {
    this.#storage.set(PENDING_AUTH_KEY, JSON.stringify(pending));
  }

  #loadPending(): PendingAuth | null {
    const raw = this.#storage.get(PENDING_AUTH_KEY);
    if (!raw) return null;
    try {
      const pending = JSON.parse(raw) as PendingAuth;
      if (!pending?.state || !pending.verifier) {
        this.#storage.remove(PENDING_AUTH_KEY);
        return null;
      }
      if (Date.now() - (pending.createdAt ?? 0) > PENDING_TTL_MS) {
        this.#storage.remove(PENDING_AUTH_KEY);
        return null;
      }
      return pending;
    } catch {
      this.#storage.remove(PENDING_AUTH_KEY);
      return null;
    }
  }

  #clearPending(): void {
    this.#storage.remove(PENDING_AUTH_KEY);
  }

  #cleanUrl(url: URL): void {
    if (typeof history === "undefined") return;
    for (const key of ["code", "error", "error_description", "state"]) {
      url.searchParams.delete(key);
    }
    const cleaned = url.pathname + url.search + url.hash;
    history.replaceState(null, "", cleaned);
  }

  #onConfigChange = (): void => {
    void this.syncProvisioned();
  };

  #setState(state: SessionState): void {
    this.#state = state;
    this.#notify();
  }

  #notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }

  #emit(name: string, detail?: unknown): void {
    dispatchWindowEvent(name, detail);
  }
}

/** Process-wide session (localStorage-backed) used by every element by default. */
export const session = new SunkenLandSession();

/** The active session: `configure({ session })`'s instance, else the singleton. */
export function getSession(): SunkenLandSession {
  return getConfig().session ?? session;
}
