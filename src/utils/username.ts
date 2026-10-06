/**
 * Colourful usernames — the rules FloatLand's `AccountName.vue` implements,
 * extracted so the `sk-username` element (and any host rendering the same
 * names) computes identical colours.
 *
 * A profile may carry a custom `usernameColor` (`profile.username_color`), but
 * the Stellar tier decides what it may use:
 *
 * | tier                      | allowed                                  |
 * | ------------------------- | ---------------------------------------- |
 * | `solian.stellar.primary`  | `plain` colours from the named palette   |
 * | `solian.stellar.nova`     | any `plain` colour (named or hex)        |
 * | `solian.stellar.supernova`| everything, gradients included           |
 * | none / unknown            | nothing (the name stays uncoloured)      |
 *
 * A custom colour that the tier does not allow is **dropped, not downgraded**
 * (FloatLand returns `null` rather than falling back), and only a profile with
 * *no* custom colour gets the tier's default membership colour. Pass
 * `ignorePermissions` to skip the gate entirely (FloatLand's escape hatch for
 * previews and admin surfaces).
 */

import type { SnUsernameColor } from "../api/schemas/account";

/** Named plain colours (`profile.username_color.value`). */
export const USERNAME_PLAIN_COLORS: Readonly<Record<string, string>> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  orange: "#f97316",
  pink: "#ec4899",
  cyan: "#06b6d4",
  lime: "#84cc16",
  indigo: "#6366f1",
  teal: "#14b8a6",
  amber: "#f59e0b",
  brown: "#a16207",
  grey: "#6b7280",
  black: "#000000",
  white: "#ffffff",
};

/** Default colour per Stellar tier (used when the profile sets none). */
export const USERNAME_TIER_COLORS: Readonly<Record<string, string>> = {
  "solian.stellar.primary": "#60a5fa",
  "solian.stellar.nova": "#39c5bb",
  "solian.stellar.supernova": "#fcd34d",
};

/** Display names for the membership tooltip. */
export const USERNAME_TIER_NAMES: Readonly<Record<string, string>> = {
  "solian.stellar.primary": "Stellar",
  "solian.stellar.nova": "Nova",
  "solian.stellar.supernova": "Supernova",
};

/** Colour per verification type (index = `verification.type`). */
export const USERNAME_VERIFICATION_COLORS: readonly string[] = [
  "#14b8a6", // 0: generic (teal)
  "#38bdf8", // 1: personal (light blue)
  "#6366f1", // 2: verified (indigo)
  "#ef4444", // 3: organization (red)
  "#f97316", // 4: creator (orange)
  "#3b82f6", // 5: developer (blue)
  "#818cf8", // 6: entertainment (blue accent)
];

/** Default colour for an unknown verification type. */
export const USERNAME_VERIFICATION_FALLBACK_COLOR = "#3b82f6";

/**
 * Verification mark per type, as SVG body markup (Lucide geometry, 24×24,
 * stroke `currentColor`). Index = `verification.type`; the shapes match
 * FloatLand's `kVerificationIcons` order.
 */
export const USERNAME_VERIFICATION_MARKS: readonly string[] = [
  // 0: generic
  '<circle cx="12" cy="12" r="10"/><path d="m16 9l-5.5 5.5L8 12"/>',
  // 1: personal
  '<path d="m16 11l2 2l4-4m-6 12v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  // 2: verified
  '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77a4 4 0 0 1 6.74 0a4 4 0 0 1 4.78 4.78a4 4 0 0 1 0 6.74a4 4 0 0 1-4.77 4.78a4 4 0 0 1-6.75 0a4 4 0 0 1-4.78-4.77a4 4 0 0 1 0-6.76"/><path d="m16 9l-5.5 5.5L8 12"/>',
  // 3: organization
  '<path d="M10 12h4m-4-4h4m0 13v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
  // 4: creator
  '<path d="M12 22a1 1 0 0 1 0-20a10 9 0 0 1 10 9a5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  // 5: developer
  '<path d="m16 18l6-6l-6-6M8 6l-6 6l6 6"/>',
  // 6: entertainment
  '<path d="m12.296 3.464l3.02 3.956M20.2 6L3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3zM3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm3.18-5.724l3.1 3.899"/>',
];

/** Membership mark (star) and bot mark bodies, same convention. */
export const USERNAME_MEMBERSHIP_MARK =
  '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z"/>';

export const USERNAME_BOT_MARK =
  '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2m16 0h2m-7-1v2m-6-2v2"/>';

/** A verification record, as the API sends it (`profile.verification`). */
export interface UsernameVerification {
  type?: number | null;
  title?: string | null;
  description?: string | null;
}

/**
 * What a name's colour is derived from. Deliberately accepts the shapes hosts
 * actually hold: a top-level `usernameColor`, or an account/publisher whose
 * profile carries it and whose `perkSubscription` (possibly nested under
 * `account`) carries the tier.
 */
export interface UsernameColorSource {
  /** `profile.usernameColor` (custom colour). */
  usernameColor?: SnUsernameColor | null;
  profile?: { usernameColor?: SnUsernameColor | null } | null;
  /** `account.perkSubscription` (or just its `identifier`/`isActive`). */
  perkSubscription?: {
    identifier?: string | null;
    isActive?: boolean | null;
  } | null;
  account?: {
    perkSubscription?: {
      identifier?: string | null;
      isActive?: boolean | null;
    } | null;
  } | null;
}

/** The custom colour of a source, wherever its shape keeps it. */
function colorOf(
  source: UsernameColorSource | null | undefined,
): SnUsernameColor | null {
  return source?.usernameColor ?? source?.profile?.usernameColor ?? null;
}

/** The membership of a source, wherever its shape keeps it. */
function perkOf(
  source: UsernameColorSource | null | undefined,
): { identifier?: string | null; isActive?: boolean | null } | null {
  return source?.perkSubscription ?? source?.account?.perkSubscription ?? null;
}

/**
 * The account/publisher fields a colourful name reads (camelCase, as the API
 * client parses them). A publisher embeds its account, so one object can carry
 * both.
 */
export interface UsernameData extends UsernameColorSource {
  id?: string | null;
  name?: string | null;
  nick?: string | null;
  automatedId?: string | null;
  verification?: UsernameVerification | null;
  profile?: {
    usernameColor?: SnUsernameColor | null;
    verification?: UsernameVerification | null;
  } | null;
  account?: UsernameData | null;
}

/** The Stellar tier identifier, when the source has one. */
export function getUsernameTier(
  source: UsernameColorSource | null | undefined,
): string | undefined {
  return perkOf(source)?.identifier ?? undefined;
}

/** Whether the membership mark is shown (an active Stellar subscription). */
export function hasActiveMembership(
  source: UsernameColorSource | null | undefined,
): boolean {
  return perkOf(source)?.isActive === true;
}

/** Normalize a palette name or hex value to a CSS colour. */
export function resolveUsernameColor(value: string): string {
  const named = USERNAME_PLAIN_COLORS[value.toLowerCase()];
  if (named) return named;
  return value.startsWith("#") ? value : `#${value}`;
}

/**
 * Whether `tier` may use `color` — the Stellar gate from FloatLand's
 * `canUseCustomUsernameColor`.
 */
export function canUseUsernameColor(
  color: SnUsernameColor | null | undefined,
  tier: string | undefined,
  ignorePermissions = false,
): boolean {
  if (ignorePermissions) return true;
  if (!color?.type) return false;
  switch (tier) {
    case "solian.stellar.primary":
      return (
        color.type === "plain" &&
        !!color.value &&
        color.value.toLowerCase() in USERNAME_PLAIN_COLORS
      );
    case "solian.stellar.nova":
      return color.type === "plain";
    case "solian.stellar.supernova":
      return true;
    default:
      return false;
  }
}

/**
 * The colour/style a username renders with, as a Vue style object:
 * `{ color }` for a plain or tier-default colour, or the background-clip
 * gradient trio for a gradient. `{}` when the name has no colour.
 */
export function usernameColorStyle(
  source: UsernameColorSource | null | undefined,
  ignorePermissions = false,
): Record<string, string> {
  const tier = getUsernameTier(source);
  const custom = source?.usernameColor;

  if (custom) {
    // Present but not allowed: no colour (FloatLand does not downgrade to the
    // membership colour).
    if (!canUseUsernameColor(custom, tier, ignorePermissions)) return {};

    if (custom.type === "plain" && custom.value) {
      return { color: resolveUsernameColor(custom.value) };
    }
    if (custom.type === "gradient" && custom.colors && custom.colors.length > 0) {
      const colors = custom.colors.map(resolveUsernameColor);
      const direction = custom.direction || "to right";
      return {
        background: `linear-gradient(${direction}, ${colors.join(", ")})`,
        "-webkit-background-clip": "text",
        "background-clip": "text",
        "-webkit-text-fill-color": "transparent",
        "text-fill-color": "transparent",
      };
    }
    return {};
  }

  if (tier && USERNAME_TIER_COLORS[tier]) {
    return { color: USERNAME_TIER_COLORS[tier] };
  }
  return {};
}

/** The membership mark's colour (grey when the tier is unknown). */
export function membershipColor(tier: string | undefined): string {
  if (tier && USERNAME_TIER_COLORS[tier]) return USERNAME_TIER_COLORS[tier];
  return "#6b7280";
}

/** The verification mark's colour for a `verification.type`. */
export function verificationColor(type: number | undefined): string {
  return (
    USERNAME_VERIFICATION_COLORS[type ?? 0] ??
    USERNAME_VERIFICATION_FALLBACK_COLOR
  );
}

/** The verification mark's SVG body for a `verification.type`. */
export function verificationMark(type: number | undefined): string {
  return (
    USERNAME_VERIFICATION_MARKS[type ?? 0] ?? USERNAME_VERIFICATION_MARKS[0] ?? ""
  );
}

/** The membership tooltip text (`Membership · Nova`). */
export function membershipLabel(tier: string | undefined): string {
  return `Membership · ${(tier && USERNAME_TIER_NAMES[tier]) || "Unknown"}`;
}

/** The verification tooltip: title plus description, when the API sends one. */
export function verificationLabel(
  verification: UsernameVerification | null | undefined,
): string {
  if (!verification) return "Verified";
  const title = verification.title || "Verified";
  return verification.description
    ? `${title}\n${verification.description}`
    : title;
}
