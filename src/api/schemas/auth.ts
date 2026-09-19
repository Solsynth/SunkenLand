import { z } from "zod";
import { snId } from "./common";

/**
 * Auth / OAuth domain schemas, ported from FloatLand's `app/types/auth.ts`
 * and the auth section of `app/utils/api.ts`.
 *
 * All schemas validate **camelCase** payloads — the client converts wire
 * snake_case responses before parsing and converts camelCase request bodies
 * back to snake_case before sending.
 */

// ── Login challenges ────────────────────────────────────────────────────────

/** Padlock auth factor attached to a challenge or account. */
export const snAuthFactorSchema = z.object({
  id: snId,
  type: z.number().int(),
  name: z.string().optional(),
  enabledAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  createdResponse: z.record(z.string(), z.unknown()).optional(),
});
export type SnAuthFactor = z.infer<typeof snAuthFactorSchema>;

/**
 * Multi-step login challenge. Completing every step produces a grant; the
 * challenge id doubles as the OAuth authorization code for
 * `POST /stargate/auth/token`.
 */
export const snAuthChallengeSchema = z.object({
  id: snId,
  stepRemain: z.number().int().optional(),
  stepTotal: z.number().int().optional(),
  riskLevel: z.number().int().optional(),
  factors: z.array(snAuthFactorSchema).optional(),
  blacklistFactors: z.array(z.string()).optional(),
  doneAt: z.string().nullable().optional(),
  grantAid: z.string().nullable().optional(),
  grantToken: z.string().nullable().optional(),
  accountId: z.string().optional(),
  /** Present once the challenge has been approved by the user's device. */
  approvedAt: z.string().nullable().optional(),
  /** Present once the challenge is no longer redeemable. */
  expiredAt: z.string().nullable().optional(),
});
export type SnAuthChallenge = z.infer<typeof snAuthChallengeSchema>;

/** Payload for `POST /stargate/auth/challenge`. */
export const createChallengePayloadSchema = z.object({
  account: z.string().min(1),
  deviceId: z.string().optional().default(""),
  deviceName: z.string().optional(),
  platform: z.number().int().optional(),
  audiences: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
});
export type CreateChallengePayload = z.infer<
  typeof createChallengePayloadSchema
>;

/** Payload for `PATCH /stargate/auth/challenge/{id}` (factor verification). */
export const verifyChallengePayloadSchema = z.object({
  factorId: snId,
  password: z.string().min(1),
});
export type VerifyChallengePayload = z.infer<
  typeof verifyChallengePayloadSchema
>;

/** Factor type metadata for the login/security UIs. */
export const FACTOR_TYPES: Record<
  number,
  { label: string; description: string; icon: string; webUnavailable?: boolean }
> = {
  0: {
    label: "Password",
    description: "Enter your account password",
    icon: "key",
  },
  1: {
    label: "Email",
    description: "Verification code sent to your email",
    icon: "mail",
  },
  2: {
    label: "In-App Notification",
    description: "Approve login from your device",
    icon: "bell",
  },
  3: {
    label: "TOTP",
    description: "Time-based one-time password",
    icon: "timer",
  },
  4: { label: "PIN", description: "Enter your security PIN", icon: "shield" },
  5: {
    label: "Recovery Code",
    description: "Single-use recovery code",
    icon: "key-round",
  },
  6: {
    label: "Physical Passport",
    description: "NFC-based authentication (unavailable on web)",
    icon: "nfc",
    webUnavailable: true,
  },
  7: {
    label: "Passkey",
    description: "Platform authenticator",
    icon: "key-square",
  },
  8: {
    label: "QR Login",
    description: "Approve sign-in by scanning a QR code from another device",
    icon: "qr-code",
  },
};

// ── OAuth tokens ────────────────────────────────────────────────────────────

/**
 * Token pair issued by `POST /stargate/auth/token`.
 *
 * The client receives the full pair (unlike FloatLand's proxy, which stores it
 * server-side and only returns display metadata) so embedded hosts can persist
 * and refresh tokens themselves.
 */
export const snAuthTokenSchema = z.object({
  token: z.string().min(1),
  expiresIn: z.number().optional(),
  refreshToken: z.string().optional(),
  refreshExpiresIn: z.number().optional(),
  expiresAt: z.string().optional(),
  refreshExpiresAt: z.string().optional(),
  /** OIDC id_token (present when the endpoint issues one). */
  idToken: z.string().optional(),
});
export type SnAuthToken = z.infer<typeof snAuthTokenSchema>;

/** OAuth2 grant types supported by the token endpoint. */
export const tokenGrantSchema = z.enum([
  "authorization_code",
  "refresh_token",
]);
export type TokenGrant = z.infer<typeof tokenGrantSchema>;

/** OAuth consent screen client info from `GET /stargate/auth/open/authorize`. */
export const authorizeClientInfoSchema = z.object({
  clientName: z.string().optional(),
  homeUri: z.string().optional(),
  picture: z.object({ id: z.string().optional() }).optional(),
  background: z.object({ id: z.string().optional() }).optional(),
  scopes: z.array(z.string()).optional(),
});
export type AuthorizeClientInfo = z.infer<typeof authorizeClientInfoSchema>;

/** Result of `POST /stargate/auth/open/authorize`. */
export const authorizeDecisionSchema = z.object({
  redirectUri: z.string().optional(),
});
export type AuthorizeDecision = z.infer<typeof authorizeDecisionSchema>;

// ── Captcha ────────────────────────────────────────────────────────────────

export const captchaConfigSchema = z.object({
  provider: z.string(),
  apiKey: z.string(),
});
export type CaptchaConfig = z.infer<typeof captchaConfigSchema>;

// ── WebAuthn passkeys ───────────────────────────────────────────────────────

/** Padlock-local passkey credential (not the Passkey auth factor). */
export const snPasskeySchema = z.object({
  id: snId,
  label: z.string(),
  accountId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SnPasskey = z.infer<typeof snPasskeySchema>;

export const passkeyAuthenticationOptionsSchema = z.object({
  challenge: z.string(),
  rpId: z.string(),
  allowCredentials: z
    .array(
      z.object({
        type: z.string(),
        id: z.string(),
        transports: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  userVerification: z.string().optional(),
  timeout: z.number().optional(),
  /** Present for discoverable (username-less) passkey login. */
  authChallengeId: z.string().optional(),
});
export type PasskeyAuthenticationOptions = z.infer<
  typeof passkeyAuthenticationOptionsSchema
>;

export const passkeyRegistrationOptionsSchema = z.object({
  challenge: z.string(),
  rpId: z.string(),
  rpName: z.string(),
  userId: z.string(),
  userName: z.string(),
  displayName: z.string(),
  pubKeyCredParams: z.array(z.object({ type: z.string(), alg: z.number() })),
  timeout: z.number().optional(),
  authenticatorSelection: z
    .object({
      authenticatorAttachment: z.string().optional(),
      residentKey: z.string().optional(),
      userVerification: z.string().optional(),
    })
    .optional(),
});
export type PasskeyRegistrationOptions = z.infer<
  typeof passkeyRegistrationOptionsSchema
>;

/** Payload for `POST /stargate/auth/challenge/{id}/passkey/complete`. */
export const completePasskeyAuthPayloadSchema = z.object({
  credentialId: z.string(),
  clientDataJson: z.string(),
  authenticatorData: z.string(),
  signature: z.string(),
  userHandle: z.string().nullable().optional(),
});
export type CompletePasskeyAuthPayload = z.infer<
  typeof completePasskeyAuthPayloadSchema
>;

/** Payload for discoverable passkey login `POST /stargate/auth/passkey/start`. */
export const startDiscoverablePasskeyPayloadSchema = z.object({
  deviceId: z.string().default(""),
  deviceName: z.string().optional(),
  platform: z.number().int().optional(),
  audiences: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
});
export type StartDiscoverablePasskeyPayload = z.infer<
  typeof startDiscoverablePasskeyPayloadSchema
>;

/** Payload for `POST /stargate/factors/passkey/start`. */
export const startPasskeyRegistrationPayloadSchema = z.object({
  deviceId: z.string().default(""),
  deviceName: z.string().optional(),
  rpId: z.string(),
  rpName: z.string(),
});
export type StartPasskeyRegistrationPayload = z.infer<
  typeof startPasskeyRegistrationPayloadSchema
>;

/** Payload for `POST /stargate/factors/passkey/complete`. */
export const completePasskeyRegistrationPayloadSchema = z.object({
  deviceId: z.string().default(""),
  label: z.string(),
  clientDataJson: z.string(),
  attestationObject: z.string(),
});
export type CompletePasskeyRegistrationPayload = z.infer<
  typeof completePasskeyRegistrationPayloadSchema
>;

// ── QR login ────────────────────────────────────────────────────────────────

/** `POST /stargate/auth/qr/generate`. */
export const qrLoginGenerateResponseSchema = z.object({
  qrChallengeId: snId,
  authChallengeId: snId,
  qrData: z.string(),
  expiresAt: z.string(),
  expiresInSeconds: z.number(),
});
export type QrLoginGenerateResponse = z.infer<
  typeof qrLoginGenerateResponseSchema
>;

/** `GET /stargate/auth/qr/{id}`. Status is a backend enum number or string. */
export const qrLoginStatusResponseSchema = z.object({
  qrChallengeId: snId,
  authChallengeId: snId,
  status: z.union([z.number(), z.string()]),
  expiresAt: z.string(),
  approvedAt: z.string().nullable().optional(),
  approvedDeviceId: z.string().nullable().optional(),
  deviceName: z.string().nullable().optional(),
  platform: z.number().optional(),
});
export type QrLoginStatusResponse = z.infer<
  typeof qrLoginStatusResponseSchema
>;

export const qrLoginStatusSchema = z.enum([
  "pending",
  "scanned",
  "approved",
  "declined",
  "expired",
]);
export type QrLoginStatus = z.infer<typeof qrLoginStatusSchema>;

/** Payload for `POST /stargate/auth/qr/generate`. */
export const generateQrLoginPayloadSchema = z.object({
  deviceId: z.string().default(""),
  deviceName: z.string().optional(),
  platform: z.number().int().optional(),
  audiences: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
});
export type GenerateQrLoginPayload = z.infer<
  typeof generateQrLoginPayloadSchema
>;

// ── Account creation / recovery ─────────────────────────────────────────────

/** Payload for `POST /stargate/accounts`. */
export const createAccountPayloadSchema = z.object({
  name: z.string().min(1),
  nick: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  language: z.string().min(2).max(16),
  captchaToken: z.string().min(1),
});
export type CreateAccountPayload = z.infer<typeof createAccountPayloadSchema>;

/** Payload for `POST /stargate/accounts/recovery/password`. */
export const requestPasswordResetPayloadSchema = z.object({
  account: z.string().min(1),
  captchaToken: z.string().min(1),
});
export type RequestPasswordResetPayload = z.infer<
  typeof requestPasswordResetPayloadSchema
>;

// ── Session / platform metadata ─────────────────────────────────────────────

export const SESSION_TYPES: Record<number, { label: string; icon: string }> = {
  0: { label: "Login", icon: "key" },
  1: { label: "OAuth", icon: "link" },
  2: { label: "OIDC", icon: "user-circle" },
  3: { label: "API Key", icon: "code" },
};

export const PLATFORM_TYPES: Record<number, { label: string; icon: string }> = {
  0: { label: "Unknown", icon: "help-circle" },
  1: { label: "Web", icon: "globe" },
  2: { label: "iOS", icon: "smartphone" },
  3: { label: "Android", icon: "smartphone" },
  4: { label: "macOS", icon: "laptop" },
  5: { label: "Windows", icon: "monitor" },
  6: { label: "Linux", icon: "terminal" },
};
