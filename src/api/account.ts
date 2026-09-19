import { z } from "zod";
import type { ApiClient } from "./client";
import { getApiClient } from "./client";
import {
  snAuthFactorSchema,
  passkeyRegistrationOptionsSchema,
  snPasskeySchema,
  type SnAuthFactor,
  type PasskeyRegistrationOptions,
  type SnPasskey,
} from "./schemas/auth";
import {
  snAccountSchema,
  snAuthSessionSchema,
  snAuthDevicesResponseSchema,
  snContactMethodSchema,
  snAccountConnectionSchema,
  publicAccountConnectionSchema,
  snAccountPunishmentSchema,
  accountBoardItemSchema,
  snPublishingSettingsSchema,
  snNotificationPreferenceSchema,
  createAuthFactorPayloadSchema,
  createContactMethodPayloadSchema,
  updateAccountPayloadSchema,
  updateProfilePayloadSchema,
  updatePublishingSettingsPayloadSchema,
  type SnAccount,
  type SnAuthSession,
  type SnAuthDevice,
  type SnContactMethod,
  type SnAccountConnection,
  type PublicAccountConnection,
  type SnAccountPunishment,
  type AccountBoardItem,
  type SnPublishingSettings,
  type SnNotificationPreference,
  type SnNotificationPreferenceLevel,
  type CreateAuthFactorPayload,
  type CreateContactMethodPayload,
  type UpdateAccountPayload,
  type UpdateProfilePayload,
  type UpdatePublishingSettingsPayload,
} from "./schemas/account";

/** The prebuilt widget keys, in display order (from Island). */
const DEFAULT_BOARD_WIDGET_KEYS = [
  "activity",
  "badges",
  "leveling",
  "social_credits",
  "contacts",
  "connections",
  "publishers",
  "notable_days",
  "verification",
  "links",
  "fortune",
] as const;

/** Board layout the API falls back to when an account has no custom board. */
export function defaultAccountBoard(): AccountBoardItem[] {
  return DEFAULT_BOARD_WIDGET_KEYS.map((widgetKey, order) => ({
    order,
    kind: "prebuilt" as const,
    widgetKey,
    isEnabled: true,
    payload: {},
  }));
}

/**
 * Validate raw board items and normalize each entry (kind degradation, default
 * payload, enabled flag). Mirrors FloatLand's `parseAccountBoardItems`.
 */
export function parseAccountBoardItems(raw: unknown[]): AccountBoardItem[] {
  const items = raw.map((entry) => {
    const item = accountBoardItemSchema.parse(entry);
    return { ...item, payload: item.payload ?? {} };
  });
  items.sort((a, b) => a.order - b.order);
  return items;
}

/**
 * Account API — profile, settings, security, and public profile data.
 * Every method takes an optional `ApiClient` (defaults to the process-wide
 * client configured via `configureApi`).
 */
export class AccountApi {
  constructor(private readonly client: ApiClient = getApiClient()) {}

  // ── Current account ────────────────────────────────────────────────────

  /** Resolve the authenticated account (`GET /stargate/accounts/me`). */
  getUserInfo(): Promise<SnAccount> {
    return this.client.request<SnAccount>("/stargate/accounts/me", {
      schema: snAccountSchema,
    });
  }

  updateAccount(payload: UpdateAccountPayload): Promise<SnAccount> {
    const clean = updateAccountPayloadSchema.parse(payload);
    return this.client.request<SnAccount>("/stargate/accounts/me", {
      method: "PATCH",
      body: clean,
      schema: snAccountSchema,
    });
  }

  deleteAccount(): Promise<void> {
    return this.client.request<void>("/stargate/accounts/me", {
      method: "DELETE",
    });
  }

  updateProfile(payload: UpdateProfilePayload): Promise<SnAccount> {
    const clean = updateProfilePayloadSchema.parse(payload);
    return this.client.request<SnAccount>("/stargate/accounts/me/profile", {
      method: "PATCH",
      body: clean,
      schema: snAccountSchema,
    });
  }

  // ── Public account data ────────────────────────────────────────────────

  /** Public account profile (`GET /stargate/accounts/{name}`). */
  fetchAccount(name: string): Promise<SnAccount> {
    return this.client.request<SnAccount>(
      `/stargate/accounts/${encodeURIComponent(name)}`,
      { auth: false, schema: snAccountSchema },
    );
  }

  /** Public punishment overview; null when the account has none. */
  async fetchAccountPunishment(
    name: string,
  ): Promise<SnAccountPunishment | null> {
    try {
      return await this.client.request<SnAccountPunishment>(
        `/stargate/accounts/${encodeURIComponent(name)}/punishments/overview`,
        { auth: false, schema: snAccountPunishmentSchema },
      );
    } catch {
      return null;
    }
  }

  /** Public OAuth-provider connections for a profile page. */
  async fetchPublicAccountConnections(
    name: string,
  ): Promise<PublicAccountConnection[]> {
    try {
      return await this.client.request<PublicAccountConnection[]>(
        `/stargate/accounts/${encodeURIComponent(name)}/connections`,
        { auth: false, schema: z.array(publicAccountConnectionSchema) },
      );
    } catch {
      return [];
    }
  }

  /**
   * Public profile board; falls back to the default widget layout when the
   * account has no board or the request fails.
   */
  async fetchPublicAccountBoard(name: string): Promise<AccountBoardItem[]> {
    try {
      const list = await this.client.request<unknown[]>(
        `/passport/accounts/${encodeURIComponent(name)}/board`,
        { auth: false },
      );
      if (!Array.isArray(list) || list.length === 0) return defaultAccountBoard();
      return parseAccountBoardItems(list);
    } catch {
      return defaultAccountBoard();
    }
  }

  // ── Auth factors (settings) ─────────────────────────────────────────────

  fetchAuthFactors(): Promise<SnAuthFactor[]> {
    return this.client.request<SnAuthFactor[]>("/stargate/factors", {
      schema: z.array(snAuthFactorSchema),
    });
  }

  createAuthFactor(payload: CreateAuthFactorPayload): Promise<SnAuthFactor> {
    const clean = createAuthFactorPayloadSchema.parse(payload);
    return this.client.request<SnAuthFactor>("/stargate/factors", {
      method: "POST",
      body: clean,
      schema: snAuthFactorSchema,
    });
  }

  deleteAuthFactor(factorId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/factors/${encodeURIComponent(factorId)}`,
      { method: "DELETE" },
    );
  }

  enableAuthFactor(
    factorId: string,
    verificationCode?: string,
  ): Promise<SnAuthFactor> {
    return this.client.request<SnAuthFactor>(
      `/stargate/factors/${encodeURIComponent(factorId)}/enable`,
      {
        method: "POST",
        headers: verificationCode ? { "Content-Type": "application/json" } : undefined,
        body: verificationCode ? JSON.stringify(verificationCode) : undefined,
        schema: snAuthFactorSchema,
      },
    );
  }

  disableAuthFactor(factorId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/factors/${encodeURIComponent(factorId)}/disable`,
      { method: "POST" },
    );
  }

  // ── Passkeys (settings) ────────────────────────────────────────────────

  startPasskeyRegistration(
    payload: {
      deviceId?: string;
      deviceName?: string;
      rpId: string;
      rpName: string;
    },
  ): Promise<PasskeyRegistrationOptions> {
    const clean = {
      ...payload,
      deviceId: payload.deviceId ?? "",
    };
    return this.client.request<PasskeyRegistrationOptions>(
      "/stargate/factors/passkey/start",
      { method: "POST", body: clean, schema: passkeyRegistrationOptionsSchema },
    );
  }

  completePasskeyRegistration(payload: {
    deviceId?: string;
    label: string;
    clientDataJson: string;
    attestationObject: string;
  }): Promise<SnPasskey> {
    return this.client.request<SnPasskey>("/stargate/factors/passkey/complete", {
      method: "POST",
      body: { ...payload, deviceId: payload.deviceId ?? "" },
      schema: snPasskeySchema,
    });
  }

  fetchPasskeys(): Promise<SnPasskey[]> {
    return this.client.request<SnPasskey[]>("/stargate/factors/passkey", {
      schema: z.array(snPasskeySchema),
    });
  }

  updatePasskey(passkeyId: string, label: string): Promise<SnPasskey> {
    return this.client.request<SnPasskey>(
      `/stargate/factors/passkey/${encodeURIComponent(passkeyId)}`,
      { method: "PATCH", body: { label }, schema: snPasskeySchema },
    );
  }

  deletePasskey(passkeyId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/factors/passkey/${encodeURIComponent(passkeyId)}`,
      { method: "DELETE" },
    );
  }

  // ── Contact methods ────────────────────────────────────────────────────

  fetchContactMethods(): Promise<SnContactMethod[]> {
    return this.client.request<SnContactMethod[]>("/stargate/contacts", {
      schema: z.array(snContactMethodSchema),
    });
  }

  createContactMethod(
    payload: CreateContactMethodPayload,
  ): Promise<SnContactMethod> {
    const clean = createContactMethodPayloadSchema.parse(payload);
    return this.client.request<SnContactMethod>("/stargate/contacts", {
      method: "POST",
      body: clean,
      schema: snContactMethodSchema,
    });
  }

  deleteContactMethod(contactId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/contacts/${encodeURIComponent(contactId)}`,
      { method: "DELETE" },
    );
  }

  verifyContactMethod(contactId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/contacts/${encodeURIComponent(contactId)}/verify`,
      { method: "POST" },
    );
  }

  setPrimaryContactMethod(contactId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/contacts/${encodeURIComponent(contactId)}/primary`,
      { method: "POST" },
    );
  }

  makeContactPublic(contactId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/contacts/${encodeURIComponent(contactId)}/public`,
      { method: "POST" },
    );
  }

  makeContactPrivate(contactId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/contacts/${encodeURIComponent(contactId)}/public`,
      { method: "DELETE" },
    );
  }

  // ── Account connections (linked OAuth providers) ───────────────────────

  fetchAccountConnections(): Promise<SnAccountConnection[]> {
    return this.client.request<SnAccountConnection[]>("/stargate/connections", {
      schema: z.array(snAccountConnectionSchema),
    });
  }

  deleteAccountConnection(connectionId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/connections/${encodeURIComponent(connectionId)}`,
      { method: "DELETE" },
    );
  }

  // ── Auth devices & sessions ────────────────────────────────────────────

  /** Group raw device payloads into the device view used by security UIs. */
  async fetchAuthDevices(): Promise<SnAuthDevice[]> {
    const raw = await this.client.request<
      { sessions: SnAuthSession[] }[]
    >("/stargate/devices", { schema: snAuthDevicesResponseSchema });

    return raw.map((item) => {
      const sessions = item.sessions ?? [];
      const client = sessions.find((s) => s.client)?.client;
      const isCurrent = sessions.some((s) => s.isCurrent);

      return {
        deviceId: client?.deviceId ?? sessions[0]?.clientId ?? "unknown",
        deviceName: client?.deviceName ?? "Unknown Device",
        deviceLabel: client?.deviceLabel ?? undefined,
        platform: client?.platform ?? 0,
        isCurrent,
        sessions,
      };
    });
  }

  fetchAuthSessions(type?: number): Promise<SnAuthSession[]> {
    const query: Record<string, string | number> = { include_children: "false" };
    if (type !== undefined) query.type = type;
    return this.client.request<SnAuthSession[]>("/stargate/sessions", {
      query,
      schema: z.array(snAuthSessionSchema).catch([]),
    });
  }

  fetchSessionChildren(parentId: string): Promise<SnAuthSession[]> {
    return this.client.request<{ items: SnAuthSession[] }>(
      `/stargate/sessions/${encodeURIComponent(parentId)}/children`,
      { schema: z.object({ items: z.array(snAuthSessionSchema) }) },
    ).then((data) => data.items);
  }

  revokeDevice(deviceId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/devices/${encodeURIComponent(deviceId)}`,
      { method: "DELETE" },
    );
  }

  revokeSession(sessionId: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    );
  }

  revokeAllOtherSessions(): Promise<void> {
    return this.client.request<void>("/stargate/sessions/others", {
      method: "DELETE",
    });
  }

  updateDeviceLabel(deviceId: string, label: string): Promise<void> {
    return this.client.request<void>(
      `/stargate/devices/${encodeURIComponent(deviceId)}/label`,
      { method: "PATCH", body: { label } },
    );
  }

  // ── Publishing settings ────────────────────────────────────────────────

  fetchPublishingSettings(): Promise<SnPublishingSettings> {
    return this.client.request<SnPublishingSettings>("/sphere/account/publishing", {
      schema: snPublishingSettingsSchema,
    });
  }

  updatePublishingSettings(
    payload: UpdatePublishingSettingsPayload,
  ): Promise<SnPublishingSettings> {
    const clean = updatePublishingSettingsPayloadSchema.parse(payload);
    return this.client.request<SnPublishingSettings>(
      "/sphere/account/publishing",
      { method: "PATCH", body: clean, schema: snPublishingSettingsSchema },
    );
  }

  // ── Notification preferences ───────────────────────────────────────────

  fetchNotificationPreferences(): Promise<SnNotificationPreference[]> {
    return this.client.request<SnNotificationPreference[]>(
      "/ring/notifications/preferences",
      { schema: z.array(snNotificationPreferenceSchema) },
    );
  }

  setNotificationPreference(
    topic: string,
    preference: SnNotificationPreferenceLevel,
  ): Promise<void> {
    return this.client.request<void>(
      `/ring/notifications/preferences/${encodeURIComponent(topic)}`,
      { method: "PUT", body: { preference } },
    );
  }

  deleteNotificationPreference(topic: string): Promise<void> {
    return this.client.request<void>(
      `/ring/notifications/preferences/${encodeURIComponent(topic)}`,
      { method: "DELETE" },
    );
  }

  addCustomNotificationTopic(
    topic: string,
    description: string,
  ): Promise<void> {
    return this.client.request<void>("/ring/notifications/topics", {
      method: "POST",
      body: { topic, description },
    });
  }
}

/** Process-wide account API bound to the configured client. */
export const accountApi = new AccountApi();
