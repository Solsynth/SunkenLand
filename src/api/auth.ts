import { z } from "zod";
import { ApiError } from "./client";
import type { ApiClient, QueryValue } from "./client";
import { getApiClient } from "./client";
import {
  snAuthChallengeSchema,
  snAuthFactorSchema,
  snAuthTokenSchema,
  authorizeClientInfoSchema,
  authorizeDecisionSchema,
  captchaConfigSchema,
  qrLoginGenerateResponseSchema,
  qrLoginStatusResponseSchema,
  passkeyAuthenticationOptionsSchema,
  createChallengePayloadSchema,
  verifyChallengePayloadSchema,
  completePasskeyAuthPayloadSchema,
  startDiscoverablePasskeyPayloadSchema,
  generateQrLoginPayloadSchema,
  createAccountPayloadSchema,
  requestPasswordResetPayloadSchema,
  type SnAuthChallenge,
  type SnAuthFactor,
  type SnAuthToken,
  type AuthorizeClientInfo,
  type AuthorizeDecision,
  type CaptchaConfig,
  type QrLoginGenerateResponse,
  type QrLoginStatusResponse,
  type QrLoginStatus,
  type PasskeyAuthenticationOptions,
  type CreateChallengePayload,
  type CompletePasskeyAuthPayload,
  type StartDiscoverablePasskeyPayload,
  type GenerateQrLoginPayload,
  type CreateAccountPayload,
} from "./schemas/auth";

export type { QrLoginStatus };

const qrLoginStatusValues = ["pending", "scanned", "approved", "declined", "expired"] as const;

/**
 * Normalize the backend's QR status (enum number or string) to the stable
 * client value. Mirrors FloatLand's `normalizeQrLoginStatus`.
 */
export function normalizeQrLoginStatus(
  status: number | string | undefined | null,
): QrLoginStatus {
  if (typeof status === "string") {
    const s = status.toLowerCase() as QrLoginStatus;
    if ((qrLoginStatusValues as readonly string[]).includes(s)) return s;
  }
  const idx = Number(status);
  return qrLoginStatusValues[idx] ?? "pending";
}

/** Best-effort device name from the user agent (for login payloads). */
export function detectDeviceName(ua: string = globalThis.navigator?.userAgent ?? ""): string {
  if (!ua) return "Web Browser";
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome Browser";
  if (ua.includes("Edg")) return "Edge Browser";
  if (ua.includes("Firefox")) return "Firefox Browser";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari Browser";
  return "Web Browser";
}

/** ClientPlatform.Web. */
export const PLATFORM_WEB = 1;

/**
 * Device metadata accepted by challenge / QR / passkey endpoints.
 * `deviceId` is the host's fingerprint or stable install id; empty is allowed.
 */
export interface DeviceInfo {
  deviceId: string;
  deviceName?: string;
  platform?: number;
}

export function buildDeviceInfo(deviceId = ""): DeviceInfo {
  return { deviceId, deviceName: detectDeviceName(), platform: PLATFORM_WEB };
}

export interface PollChallengeOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: (status: "pending" | "approved" | "expired") => void;
}

export type ChallengePollResult = "approved" | "expired";

/**
 * Auth API — OAuth first.
 *
 * Every method takes an optional `ApiClient` (defaults to the process-wide
 * client configured via `configureApi`), so hosts can construct private
 * clients with their own base URL or token provider.
 */
export class AuthApi {
  constructor(private readonly client: ApiClient = getApiClient()) {}

  /**
   * Poll a challenge until the user approves it on another device (InAppCode /
   * QR-style factor). Replicates FloatLand's `challenge-poll` SSE handler:
   *
   * - `approvedAt` set (or `stepRemain` drained with a grant) → "approved"
   * - `expiredAt` set, or the challenge 404s → "expired"
   *
   * Throws an `Error` when aborted via `signal` or the timeout elapses.
   */
  async pollChallenge(
    challengeId: string,
    options: PollChallengeOptions = {},
  ): Promise<ChallengePollResult> {
    const { intervalMs = 2000, timeoutMs = 5 * 60 * 1000, signal, onStatus } = options;
    const deadline = Date.now() + timeoutMs;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });

    while (true) {
      if (signal?.aborted) throw new Error("Challenge polling aborted");
      if (Date.now() >= deadline) throw new Error("Challenge polling timed out");

      let challenge: SnAuthChallenge | null = null;
      try {
        challenge = await this.getChallenge(challengeId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          onStatus?.("expired");
          return "expired";
        }
        // Transient error — keep polling.
        await sleep(intervalMs);
        continue;
      }

      if (challenge.expiredAt) {
        onStatus?.("expired");
        return "expired";
      }
      if (challenge.approvedAt) {
        onStatus?.("approved");
        return "approved";
      }
      onStatus?.("pending");
      await sleep(intervalMs);
    }
  }

  // ── OAuth token endpoints ──────────────────────────────────────────────

  /** Exchange an authorization code (challenge id) for a token pair. */
  exchangeAuthorizationCode(code: string): Promise<SnAuthToken> {
    return this.client.request<SnAuthToken>("/stargate/auth/token", {
      method: "POST",
      body: { grantType: "authorization_code", code },
      auth: false,
      schema: snAuthTokenSchema,
    });
  }

  /** Exchange a refresh token for a fresh token pair. */
  refreshToken(refreshToken: string): Promise<SnAuthToken> {
    return this.client.request<SnAuthToken>("/stargate/auth/token", {
      method: "POST",
      body: { grantType: "refresh_token", refreshToken },
      auth: false,
      schema: snAuthTokenSchema,
    });
  }

  /** Terminate the current server-side session. */
  logout(): Promise<void> {
    return this.client.request<void>("/stargate/auth/logout", {
      method: "POST",
    });
  }

  // ── OAuth authorization (consent) ──────────────────────────────────────

  /**
   * Client metadata for the OAuth consent screen. `query` carries the
   * authorize request (`client_id`, `redirect_uri`, `response_type`, …).
   */
  getAuthorizeClientInfo(
    query: Record<string, string>,
  ): Promise<AuthorizeClientInfo> {
    return this.client.request<AuthorizeClientInfo>(
      "/stargate/auth/open/authorize",
      { query, auth: false, schema: authorizeClientInfoSchema },
    );
  }

  /** Submit the consent decision; returns the post-authorize redirect. */
  submitAuthorizeDecision(
    query: Record<string, string>,
    authorize: boolean,
  ): Promise<AuthorizeDecision> {
    const params = new URLSearchParams(query);
    params.set("authorize", authorize ? "true" : "false");
    return this.client.request<AuthorizeDecision>(
      "/stargate/auth/open/authorize",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
        schema: authorizeDecisionSchema,
      },
    );
  }

  // ── External provider login (OIDC / OAuth connections) ────────────────

  /**
   * Authorization URL that starts an external provider login (e.g. GitHub,
   * Google). After the provider round-trip the backend redirects to
   * `returnUrl` with an authorization code.
   */
  buildProviderLoginUrl(
    provider: string,
    options: {
      returnUrl: string;
      deviceId: string;
      flow?: string;
    },
  ): string {
    const params = new URLSearchParams({
      returnUrl: options.returnUrl,
      deviceId: options.deviceId,
      flow: options.flow ?? "login",
    });
    return this.client.url(
      `/stargate/auth/login/${provider.toLowerCase()}`,
      params,
    );
  }

  /**
   * Callback URL used by an intermediate page to forward the provider's
   * response to the backend's callback handler.
   */
  buildProviderCallbackUrl(
    provider: string,
    query: Record<string, QueryValue>,
  ): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") continue;
      qs.set(key, String(value));
    }
    const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
    return this.client.url(`/stargate/auth/callback/${provider.toLowerCase()}${suffix}`);
  }

  /** Authorization URL that links an OAuth provider to the current account. */
  buildConnectionLoginUrl(provider: string): string {
    return this.client.url(`/stargate/auth/login/${provider.toLowerCase()}`);
  }

  // ── Challenge login flow ───────────────────────────────────────────────

  /** Start a multi-step login challenge for `account`. */
  createChallenge(payload: CreateChallengePayload): Promise<SnAuthChallenge> {
    const clean = createChallengePayloadSchema.parse(payload);
    return this.client.request<SnAuthChallenge>("/stargate/auth/challenge", {
      method: "POST",
      body: clean,
      auth: false,
      schema: snAuthChallengeSchema,
    });
  }

  getFactors(challengeId: string): Promise<SnAuthFactor[]> {
    return this.client.request<SnAuthFactor[]>(
      `/stargate/auth/challenge/${encodeURIComponent(challengeId)}/factors`,
      { auth: false, schema: z.array(snAuthFactorSchema) },
    );
  }

  getChallenge(challengeId: string): Promise<SnAuthChallenge> {
    return this.client.request<SnAuthChallenge>(
      `/stargate/auth/challenge/${encodeURIComponent(challengeId)}`,
      { auth: false, schema: snAuthChallengeSchema },
    );
  }

  /** Ask the backend to deliver a one-time code (email/push factor). */
  requestFactorCode(challengeId: string, factorId: string): Promise<unknown> {
    return this.client.request<unknown>(
      `/stargate/auth/challenge/${encodeURIComponent(challengeId)}/factors/${encodeURIComponent(factorId)}`,
      { method: "POST", auth: false },
    );
  }

  /** Verify a factor (e.g. password) and advance the challenge. */
  verifyChallenge(
    challengeId: string,
    factorId: string,
    password: string,
  ): Promise<SnAuthChallenge> {
    const payload = verifyChallengePayloadSchema.parse({ factorId, password });
    return this.client.request<SnAuthChallenge>(
      `/stargate/auth/challenge/${encodeURIComponent(challengeId)}`,
      { method: "PATCH", body: payload, auth: false, schema: snAuthChallengeSchema },
    );
  }

  // ── Passkeys ───────────────────────────────────────────────────────────

  /** Start a WebAuthn assertion for an account-known challenge. */
  async startPasskeyAuthentication(
    challengeId: string,
  ): Promise<PasskeyAuthenticationOptions> {
    const data = await this.client.request<PasskeyAuthenticationOptions>(
      `/stargate/auth/challenge/${encodeURIComponent(challengeId)}/passkey/start`,
      { method: "POST", auth: false, schema: passkeyAuthenticationOptionsSchema },
    );
    return {
      challenge: data.challenge,
      rpId: data.rpId,
      allowCredentials: data.allowCredentials ?? [],
      userVerification: data.userVerification ?? "preferred",
      timeout: data.timeout,
    };
  }

  /** Complete a passkey assertion for an account-known challenge. */
  completePasskeyAuthentication(
    challengeId: string,
    payload: CompletePasskeyAuthPayload,
  ): Promise<SnAuthChallenge> {
    const clean = completePasskeyAuthPayloadSchema.parse(payload);
    return this.client.request<SnAuthChallenge>(
      `/stargate/auth/challenge/${encodeURIComponent(challengeId)}/passkey/complete`,
      { method: "POST", body: clean, auth: false, schema: snAuthChallengeSchema },
    );
  }

  /** Discoverable (resident) passkey login without a username. */
  async startDiscoverablePasskeyAuthentication(
    payload: StartDiscoverablePasskeyPayload,
  ): Promise<PasskeyAuthenticationOptions> {
    const clean = startDiscoverablePasskeyPayloadSchema.parse({
      ...payload,
      platform: payload.platform ?? 1,
    });
    const data = await this.client.request<PasskeyAuthenticationOptions>(
      "/stargate/auth/passkey/start",
      { method: "POST", body: clean, auth: false, schema: passkeyAuthenticationOptionsSchema },
    );
    return {
      challenge: data.challenge,
      rpId: data.rpId,
      allowCredentials: data.allowCredentials ?? [],
      userVerification: data.userVerification ?? "preferred",
      timeout: data.timeout,
      authChallengeId: data.authChallengeId,
    };
  }

  completeDiscoverablePasskeyAuthentication(
    challengeId: string,
    payload: CompletePasskeyAuthPayload,
  ): Promise<SnAuthChallenge> {
    const clean = completePasskeyAuthPayloadSchema.parse(payload);
    return this.client.request<SnAuthChallenge>(
      `/stargate/auth/passkey/${encodeURIComponent(challengeId)}/complete`,
      { method: "POST", body: clean, auth: false, schema: snAuthChallengeSchema },
    );
  }

  // ── QR login ───────────────────────────────────────────────────────────

  generateQrLogin(payload: GenerateQrLoginPayload): Promise<QrLoginGenerateResponse> {
    const clean = generateQrLoginPayloadSchema.parse({
      ...payload,
      platform: payload.platform ?? 1,
    });
    return this.client.request<QrLoginGenerateResponse>("/stargate/auth/qr/generate", {
      method: "POST",
      body: clean,
      auth: false,
      schema: qrLoginGenerateResponseSchema,
    });
  }

  getQrLoginStatus(qrChallengeId: string): Promise<QrLoginStatusResponse> {
    return this.client.request<QrLoginStatusResponse>(
      `/stargate/auth/qr/${encodeURIComponent(qrChallengeId)}`,
      { auth: false, schema: qrLoginStatusResponseSchema },
    );
  }

  // ── Account creation / recovery / captcha ──────────────────────────────

  createAccount(payload: CreateAccountPayload): Promise<unknown> {
    const clean = createAccountPayloadSchema.parse(payload);
    return this.client.request<unknown>("/stargate/accounts", {
      method: "POST",
      body: clean,
      auth: false,
    });
  }

  requestPasswordReset(
    account: string,
    captchaToken: string,
  ): Promise<unknown> {
    const payload = requestPasswordResetPayloadSchema.parse({ account, captchaToken });
    return this.client.request<unknown>("/stargate/accounts/recovery/password", {
      method: "POST",
      body: payload,
      auth: false,
    });
  }

  getCaptchaConfig(): Promise<CaptchaConfig> {
    return this.client.request<CaptchaConfig>("/stargate/auth/captcha", {
      auth: false,
      schema: captchaConfigSchema,
    });
  }
}

/** Process-wide auth API bound to the configured client. */
export const authApi = new AuthApi();
