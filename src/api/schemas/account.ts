import { z } from "zod";
import { snId, snMeta, snNullableTimestamp, snTimestamp } from "./common";

/**
 * Account domain schemas, ported from FloatLand's `app/types/auth.ts` and the
 * account sections of `app/utils/api.ts`.
 *
 * All schemas validate **camelCase** payloads (see schemas/auth.ts header).
 */

// ── Profile ─────────────────────────────────────────────────────────────────

export const snAccountProfileSchema = z.object({
  id: z.string().optional(),
  bio: z.string().optional(),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  gender: z.string().optional(),
  pronouns: z.string().optional(),
  location: z.string().optional(),
  timeZone: z.string().optional(),
  birthday: z.string().nullable().optional(),
  lastSeenAt: z.string().nullable().optional(),
  picture: z.object({ id: z.string() }).nullable().optional(),
  background: z.object({ id: z.string() }).nullable().optional(),
  links: z
    .array(z.object({ url: z.string(), name: z.string().optional(), label: z.string().optional() }))
    .optional(),
  verification: z
    .object({
      type: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      verifiedBy: z.string().optional(),
    })
    .nullable()
    .optional(),
  /** @deprecated API returns `verification`; kept for older payloads */
  verified: z
    .object({
      type: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      verifiedBy: z.string().optional(),
    })
    .nullable()
    .optional(),
  activeBadge: z.lazy(() => snAccountBadgeSchema).nullable().optional(),
  level: z.number().optional(),
  experience: z.number().optional(),
  levelingProgress: z.number().optional(),
  socialCredits: z.number().optional(),
  socialCreditsLevel: z.number().optional(),
  createdAt: snTimestamp.optional(),
  updatedAt: snTimestamp.optional(),
});
export type SnAccountProfile = z.infer<typeof snAccountProfileSchema>;

export const snAccountBadgeSchema = z.object({
  id: snId,
  type: z.string(),
  label: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  activatedAt: z.string().nullable().optional(),
  expiredAt: z.string().nullable().optional(),
  accountId: z.string().optional(),
  createdAt: snTimestamp.optional(),
  updatedAt: snTimestamp.optional(),
  meta: snMeta.optional(),
});
export type SnAccountBadge = z.infer<typeof snAccountBadgeSchema>;

export const snContactMethodSchema = z.object({
  id: snId,
  type: z.number().int(),
  content: z.string(),
  isPrimary: z.boolean(),
  isPublic: z.boolean(),
  verifiedAt: z.string().nullable().optional(),
  createdAt: snTimestamp,
});
export type SnContactMethod = z.infer<typeof snContactMethodSchema>;

// ── Account ─────────────────────────────────────────────────────────────────

export const snAccountSchema = z.object({
  id: snId,
  name: z.string(),
  nick: z.string().optional(),
  language: z.string().optional(),
  region: z.string().optional(),
  activatedAt: snNullableTimestamp.optional(),
  automatedId: z.string().nullable().optional(),
  isSuperuser: z.boolean().optional(),
  perkLevel: z.number().optional(),
  perkSubscription: z.record(z.string(), z.unknown()).nullable().optional(),
  profile: z.lazy(() => snAccountProfileSchema).optional(),
  badges: z.array(z.lazy(() => snAccountBadgeSchema)).optional(),
  contacts: z.array(snContactMethodSchema).optional(),
  createdAt: snTimestamp.optional(),
  updatedAt: snTimestamp.optional(),
  deletedAt: snNullableTimestamp.optional(),
});
export type SnAccount = z.infer<typeof snAccountSchema>;

/** Payload for `PATCH /stargate/accounts/me`. */
export const updateAccountPayloadSchema = z.object({
  name: z.string().min(1).optional(),
  nick: z.string().optional(),
  language: z.string().optional(),
  region: z.string().optional(),
});
export type UpdateAccountPayload = z.infer<typeof updateAccountPayloadSchema>;

/** Payload for `PATCH /stargate/accounts/me/profile`. */
export const updateProfilePayloadSchema = z.object({
  bio: z.string().optional(),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  gender: z.string().optional(),
  pronouns: z.string().optional(),
  location: z.string().optional(),
  timeZone: z.string().optional(),
  birthday: z.string().nullable().optional(),
  pictureId: z.string().optional(),
  backgroundId: z.string().optional(),
  links: z
    .array(z.object({ name: z.string(), url: z.string() }))
    .optional(),
});
export type UpdateProfilePayload = z.infer<typeof updateProfilePayloadSchema>;

// ── Connections (linked OAuth providers) ────────────────────────────────────

export const snAccountConnectionSchema = z.object({
  id: snId,
  provider: z.string(),
  providedIdentifier: z.string(),
  meta: z.record(z.string(), z.string()),
  lastUsedAt: z.string(),
  createdAt: z.string(),
});
export type SnAccountConnection = z.infer<typeof snAccountConnectionSchema>;

/** Public shape from `GET /stargate/accounts/{name}/connections`. */
export const publicAccountConnectionSchema = z.object({
  provider: z.string(),
  providedIdentifier: z.string(),
  url: z.string().optional(),
});
export type PublicAccountConnection = z.infer<
  typeof publicAccountConnectionSchema
>;

// ── Punishments ─────────────────────────────────────────────────────────────

export const snAccountPunishmentSchema = z.object({
  id: snId,
  type: z.number().int(),
  reason: z.string().optional(),
  createdAt: snTimestamp,
  updatedAt: snTimestamp.optional(),
  expiredAt: z.string().nullable().optional(),
  /** @deprecated prefer expiredAt */
  expiresAt: z.string().nullable().optional(),
  accountId: z.string().optional(),
  creatorId: z.string().nullable().optional(),
  blockedPermissions: z.array(z.string()).nullable().optional(),
  issuedBy: z.string().optional(),
});
export type SnAccountPunishment = z.infer<typeof snAccountPunishmentSchema>;

// ── Account board (public profile widgets) ─────────────────────────────────

/** Board widget kind: 0/prebuilt or 1/custom_app, normalized to strings. */
export const accountBoardItemKindSchema = z
  .union([
    z.literal(0),
    z.literal(1),
    z.literal("prebuilt"),
    z.literal("custom_app"),
  ])
  .catch("prebuilt")
  .transform((kind) => (kind === 0 ? "prebuilt" : kind === 1 ? "custom_app" : kind));
export type AccountBoardItemKind = z.infer<typeof accountBoardItemKindSchema>;

/**
 * Payload field envelope used by custom board widgets. Prebuilt widgets may
 * also store plain scalars under payload keys.
 */
export const boardPayloadFieldSchema = z.object({
  value: z.unknown().optional(),
  label: z.string().optional(),
  format: z.string().optional(),
});
export type BoardPayloadField = z.infer<typeof boardPayloadFieldSchema>;

export const accountBoardPayloadSchema = z.record(
  z.string(),
  z.union([
    boardPayloadFieldSchema,
    z.string(),
    z.number(),
    z.boolean(),
    z.unknown(),
  ]),
);
export type AccountBoardPayload = z.infer<typeof accountBoardPayloadSchema>;

/** Profile board item from `GET /passport/accounts/{name}/board`. */
export const accountBoardItemSchema = z.object({
  id: z.string().optional(),
  accountId: z.string().optional(),
  order: z.number().int(),
  // The backend may serialize kind as a number or string; anything else
  // degrades to a prebuilt widget, matching FloatLand's normalization.
  kind: accountBoardItemKindSchema,
  widgetKey: z.string().nullable().optional(),
  customAppId: z.string().nullable().optional(),
  customAppWidgetKey: z.string().nullable().optional(),
  isEnabled: z.boolean().default(true).catch(true),
  payload: accountBoardPayloadSchema.optional(),
  createdAt: snTimestamp.optional(),
  updatedAt: snTimestamp.optional(),
});
export type AccountBoardItem = z.infer<typeof accountBoardItemSchema>;

// ── Auth factors / passkeys / contacts (settings) ──────────────────────────

/** Payload for `POST /stargate/factors`. */
export const createAuthFactorPayloadSchema = z.object({
  type: z.number().int(),
  secret: z.string().nullable().optional(),
});
export type CreateAuthFactorPayload = z.infer<
  typeof createAuthFactorPayloadSchema
>;

/** Payload for `POST /stargate/contacts`. */
export const createContactMethodPayloadSchema = z.object({
  type: z.number().int(),
  content: z.string().min(1),
});
export type CreateContactMethodPayload = z.infer<
  typeof createContactMethodPayloadSchema
>;

// ── Sessions / devices ──────────────────────────────────────────────────────

export const snAuthClientSchema = z.object({
  id: snId,
  platform: z.number().int(),
  deviceName: z.string(),
  deviceLabel: z.string().nullable().optional(),
  deviceId: z.string(),
  accountId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
});
export type SnAuthClient = z.infer<typeof snAuthClientSchema>;

export const snAuthSessionSchema = z.object({
  id: snId,
  type: z.number().int(),
  label: z.string().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  location: z
    .object({
      city: z.string().optional(),
      country: z.string().optional(),
      countryCode: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .optional(),
  isCurrent: z.boolean().optional(),
  childrenCount: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastGrantedAt: z.string(),
  expiredAt: z.string().optional(),
  audiences: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  clientId: z.string().optional(),
  client: z.lazy(() => snAuthClientSchema).nullable().optional(),
  parentSessionId: z.string().nullable().optional(),
  accountId: z.string().optional(),
  challengeId: z.string().optional(),
});
export type SnAuthSession = z.infer<typeof snAuthSessionSchema>;

/** Grouped device view built from `GET /stargate/devices`. */
export const snAuthDeviceSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  deviceLabel: z.string().optional(),
  platform: z.number().int(),
  isCurrent: z.boolean(),
  sessions: z.array(snAuthSessionSchema),
});
export type SnAuthDevice = z.infer<typeof snAuthDeviceSchema>;

/** Raw wire shape of `GET /stargate/devices` before grouping. */
export const snAuthDevicesResponseSchema = z.array(
  z.object({ sessions: z.array(snAuthSessionSchema) }),
);

// ── Publishing settings ─────────────────────────────────────────────────────

export const snPublishingSettingsSchema = z.object({
  id: snId,
  accountId: z.string(),
  defaultPostingPublisherId: z.string().nullable().optional(),
  defaultReplyPublisherId: z.string().nullable().optional(),
  defaultFediversePublisherId: z.string().nullable().optional(),
  createdAt: snTimestamp.optional(),
  updatedAt: snTimestamp.nullable().optional(),
});
export type SnPublishingSettings = z.infer<typeof snPublishingSettingsSchema>;

/** Payload for `PATCH /sphere/account/publishing`. */
export const updatePublishingSettingsPayloadSchema = z.object({
  defaultPostingPublisherId: z.string().nullable().optional(),
  defaultReplyPublisherId: z.string().nullable().optional(),
  defaultFediversePublisherId: z.string().nullable().optional(),
});
export type UpdatePublishingSettingsPayload = z.infer<
  typeof updatePublishingSettingsPayloadSchema
>;

// ── Notification preferences ────────────────────────────────────────────────

/** 0 = normal, 1 = silent, 2 = reject */
export const snNotificationPreferenceLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
]);
export type SnNotificationPreferenceLevel = z.infer<
  typeof snNotificationPreferenceLevelSchema
>;

export const snNotificationTopicSchema = z.object({
  topic: z.string(),
  description: z.string(),
});
export type SnNotificationTopic = z.infer<typeof snNotificationTopicSchema>;

export const snNotificationPreferenceSchema = z.object({
  id: snId,
  accountId: z.string(),
  topic: z.string(),
  preference: snNotificationPreferenceLevelSchema,
  createdAt: snTimestamp.optional(),
  updatedAt: snTimestamp.optional(),
});
export type SnNotificationPreference = z.infer<
  typeof snNotificationPreferenceSchema
>;

/** Default topics from Island's `NotificationsApi._defaultTopics`. */
export const DEFAULT_NOTIFICATION_TOPICS: SnNotificationTopic[] = [
  { topic: "posts.mentions.new", description: "Post mentions" },
  { topic: "post.replies", description: "Post replies" },
  { topic: "posts.reactions.new", description: "New reactions" },
  { topic: "posts.awards.new", description: "Post awards" },
  {
    topic: "subscriptions.discontinued_in_app",
    description: "Subscription discontinued",
  },
  { topic: "subscriptions.begun", description: "Subscription started" },
  { topic: "gifts.claimed", description: "Gift claimed" },
  { topic: "wallets.transactions", description: "Wallet transactions" },
  { topic: "auth.verification", description: "Auth verification" },
  { topic: "invites.realms", description: "Realm invites" },
];
