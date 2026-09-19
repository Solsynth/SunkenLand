/**
 * Small formatting helpers shared by the embeddable elements. These mirror the
 * display conventions FloatLand uses in its reply UI (`getDisplayName`,
 * initials avatar, relative timestamps).
 */

export interface PublisherLike {
  name?: string | null;
  nick?: string | null;
  picture?: { url?: string | null } | null;
  profile?: { picture?: { url?: string | null } | null } | null;
}

/** Prefer nick over the account/publisher name, like FloatLand. */
export function getDisplayName(publisher: PublisherLike | null | undefined): string {
  return publisher?.nick || publisher?.name || "Unknown";
}

/** Up to two initials for placeholder avatars. */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Avatar picture URL, falling back through profile then publisher picture. */
export function getAvatarUrl(
  publisher: PublisherLike | null | undefined,
): string | undefined {
  return publisher?.profile?.picture?.url ?? publisher?.picture?.url ?? undefined;
}

/** FloatLand-style relative time: just now / Nm / Nh / Nd / Nw / date. */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
