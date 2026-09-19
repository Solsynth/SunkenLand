import { ApiError } from "./api/client";
import { snakeToCamel } from "./api/case";

/**
 * Minimal OpenID Connect client (authorization code + PKCE) for browser hosts.
 *
 * Solarpass is the platform's identity provider, not a backend "connection":
 * a widget authenticates against it the way any OIDC client would. Endpoints
 * come from the issuer's discovery document
 * (`{issuer}/.well-known/openid-configuration`), so nothing is hardcoded
 * beyond the default issuer:
 *
 *   issuer                 https://api.solian.app
 *   authorization_endpoint https://id.solian.app/auth/authorize
 *   token_endpoint         https://api.solian.app/stargate/auth/open/token
 *   userinfo_endpoint      https://api.solian.app/stargate/auth/open/userinfo
 *
 * The provider requires PKCE for public clients (`token_endpoint_auth_methods:
 * ["none", …]`, `code_challenge_methods_supported: ["S256","plain"]`,
 * `RequirePkce` on the registered client), so this module always sends an S256
 * challenge and never keeps a secret in the browser. A `clientSecret` is only
 * accepted for confidential clients that genuinely have one.
 *
 * Hosts must register an app (client id + redirect URI) before signing in.
 */

export const DEFAULT_OIDC_ISSUER = "https://api.solian.app";

export const DEFAULT_OIDC_SCOPES = ["openid", "profile", "email"];

/** Subset of the provider's discovery document this client uses. */
export interface OidcDiscovery {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  scopesSupported: string[];
  codeChallengeMethodsSupported: string[];
  grantTypesSupported: string[];
  responseTypesSupported: string[];
}

/** OIDC userinfo claims the provider returns (`sub`, `name`, `preferred_username`, …). */
export interface OidcUserInfo {
  sub: string;
  name?: string;
  preferredUsername?: string;
  email?: string;
  emailVerified?: boolean;
}

export interface OidcTokenResponse {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

export interface OidcClientOptions {
  /** Issuer base URL (default `DEFAULT_OIDC_ISSUER`). */
  issuer?: string;
  /** Registered client id (the app's slug or UUID). Required. */
  clientId: string;
  /**
   * Registered redirect URI. Defaults to the current page (origin + path) —
   * it must be listed on the client's `RedirectUris`.
   */
  redirectUri?: string;
  /** Requested scopes (default `openid profile email`). */
  scopes?: string[];
  /**
   * Only for confidential clients. Public browser clients must omit this and
   * rely on PKCE — a secret in page source is not a secret.
   */
  clientSecret?: string;
  /** Test seam / SSR override. */
  fetchImpl?: typeof fetch;
}

const discoveryCache = new Map<string, Promise<OidcDiscovery>>();

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  return fetchImpl ?? globalThis.fetch.bind(globalThis);
}

/** Current page URL without query/hash — the default registered redirect URI. */
export function defaultRedirectUri(location: Location = window.location): string {
  return `${location.origin}${location.pathname}`;
}

/**
 * Fetch (and memoize) the issuer's discovery document. Discovery failures are
 * not cached, so a transient network error can be retried.
 */
export function discoverOidc(
  issuer: string = DEFAULT_OIDC_ISSUER,
  fetchImpl?: typeof fetch,
): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuer);
  if (cached) return cached;

  const request = (async () => {
    const response = await resolveFetch(fetchImpl)(
      `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      throw new ApiError(
        `OIDC discovery failed for ${issuer}`,
        response.status,
        { detail: `HTTP ${response.status}` },
      );
    }
    const wire = snakeToCamel<Record<string, unknown>>(await response.json());
    const doc: OidcDiscovery = {
      issuer: String(wire.issuer ?? issuer),
      authorizationEndpoint: String(wire.authorizationEndpoint ?? ""),
      tokenEndpoint: String(wire.tokenEndpoint ?? ""),
      userinfoEndpoint: wire.userinfoEndpoint
        ? String(wire.userinfoEndpoint)
        : undefined,
      jwksUri: wire.jwksUri ? String(wire.jwksUri) : undefined,
      scopesSupported: (wire.scopesSupported as string[]) ?? [],
      codeChallengeMethodsSupported:
        (wire.codeChallengeMethodsSupported as string[]) ?? [],
      grantTypesSupported: (wire.grantTypesSupported as string[]) ?? [],
      responseTypesSupported: (wire.responseTypesSupported as string[]) ?? [],
    };
    if (!doc.authorizationEndpoint || !doc.tokenEndpoint) {
      throw new ApiError(`Incomplete OIDC discovery for ${issuer}`, 500, {
        detail: "authorization_endpoint / token_endpoint missing",
      });
    }
    return doc;
  })();

  discoveryCache.set(issuer, request);
  request.catch(() => discoveryCache.delete(issuer));
  return request;
}

// ── PKCE + state ───────────────────────────────────────────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomUrlSafe(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64UrlEncode(buffer);
}

/** Opaque CSRF-binding value echoed back by the provider. */
export function createOidcState(): string {
  return randomUrlSafe(16);
}

/** OIDC `nonce`, bound into the id_token. */
export function createOidcNonce(): string {
  return randomUrlSafe(16);
}

/** `code_verifier` + its S256 `code_challenge` (RFC 7636). */
export async function createPkcePair(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = randomUrlSafe(48);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

// ── Authorization request ──────────────────────────────────────────────────

export interface AuthorizeUrlParams {
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: "S256" | "plain";
  /** Extra provider-specific parameters (e.g. `prompt`, `login_hint`). */
  extra?: Record<string, string>;
}

/** Build the `response_type=code` authorization URL. */
export function buildAuthorizeUrl(
  discovery: OidcDiscovery,
  params: AuthorizeUrlParams,
): string {
  const url = new URL(discovery.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  const scopes = params.scopes?.length ? params.scopes : DEFAULT_OIDC_SCOPES;
  url.searchParams.set("scope", scopes.join(" "));
  if (params.state) url.searchParams.set("state", params.state);
  if (params.nonce) url.searchParams.set("nonce", params.nonce);
  if (params.codeChallenge) {
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set(
      "code_challenge_method",
      params.codeChallengeMethod ?? "S256",
    );
  }
  for (const [key, value] of Object.entries(params.extra ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// ── Token endpoint ─────────────────────────────────────────────────────────

function toTokenResponse(wire: Record<string, unknown>): OidcTokenResponse {
  const accessToken = wire.accessToken;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new ApiError("OIDC token response is missing access_token", 500, {
      detail: JSON.stringify(wire).slice(0, 200),
    });
  }
  return {
    accessToken,
    idToken: typeof wire.idToken === "string" ? wire.idToken : undefined,
    refreshToken:
      typeof wire.refreshToken === "string" ? wire.refreshToken : undefined,
    expiresIn: typeof wire.expiresIn === "number" ? wire.expiresIn : undefined,
    tokenType: typeof wire.tokenType === "string" ? wire.tokenType : undefined,
    scope: typeof wire.scope === "string" ? wire.scope : undefined,
  };
}

async function requestToken(
  discovery: OidcDiscovery,
  form: Record<string, string>,
  fetchImpl?: typeof fetch,
): Promise<OidcTokenResponse> {
  const response = await resolveFetch(fetchImpl)(discovery.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { error: text.trim() };
  }
  if (!response.ok) {
    const code = typeof body.error === "string" ? body.error : undefined;
    const description =
      typeof body.error_description === "string"
        ? body.error_description
        : code;
    throw new ApiError(description ?? `HTTP ${response.status}`, response.status, {
      code,
      detail: description,
    });
  }
  return toTokenResponse(snakeToCamel<Record<string, unknown>>(body));
}

/** Exchange an authorization code (PKCE verifier required for public clients). */
export function exchangeOidcCode(
  discovery: OidcDiscovery,
  params: {
    clientId: string;
    code: string;
    redirectUri: string;
    codeVerifier?: string;
    clientSecret?: string;
  },
  fetchImpl?: typeof fetch,
): Promise<OidcTokenResponse> {
  const form: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: params.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
  };
  if (params.codeVerifier) form.code_verifier = params.codeVerifier;
  if (params.clientSecret) form.client_secret = params.clientSecret;
  return requestToken(discovery, form, fetchImpl);
}

/** Refresh an access token (`grant_type=refresh_token`). */
export function refreshOidcToken(
  discovery: OidcDiscovery,
  params: { clientId: string; refreshToken: string; clientSecret?: string },
  fetchImpl?: typeof fetch,
): Promise<OidcTokenResponse> {
  const form: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: params.clientId,
    refresh_token: params.refreshToken,
  };
  if (params.clientSecret) form.client_secret = params.clientSecret;
  return requestToken(discovery, form, fetchImpl);
}

/** Fetch OIDC userinfo with an access token. */
export async function fetchOidcUserInfo(
  discovery: OidcDiscovery,
  accessToken: string,
  fetchImpl?: typeof fetch,
): Promise<OidcUserInfo> {
  if (!discovery.userinfoEndpoint) {
    throw new ApiError("Issuer does not advertise a userinfo endpoint", 500);
  }
  const response = await resolveFetch(fetchImpl)(discovery.userinfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new ApiError(`userinfo failed`, response.status, {
      detail: `HTTP ${response.status}`,
    });
  }
  const wire = snakeToCamel<Record<string, unknown>>(await response.json());
  if (typeof wire.sub !== "string" || !wire.sub) {
    throw new ApiError("userinfo response is missing sub", 500);
  }
  return {
    sub: wire.sub,
    name: typeof wire.name === "string" ? wire.name : undefined,
    preferredUsername:
      typeof wire.preferredUsername === "string"
        ? wire.preferredUsername
        : undefined,
    email: typeof wire.email === "string" ? wire.email : undefined,
    emailVerified:
      typeof wire.emailVerified === "boolean" ? wire.emailVerified : undefined,
  };
}

/** Decode a JWT payload without verifying it (display/claims only). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
