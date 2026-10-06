/**
 * Small formatting helpers shared by the embeddable elements. These mirror the
 * display conventions FloatLand uses in its reply UI (`getDisplayName`,
 * initials avatar, relative timestamps).
 */

import { getFileUrl, type FileLike } from "./files";

/** What `getDisplayName` needs — deliberately looser than `PublisherLike`
 * so accounts and publishers both satisfy it without weak-type rejections. */
export interface DisplayNameLike {
  name?: string | null;
  /** `undefined` when absent (e.g. optional schema fields) vs explicit null. */
  nick?: string | null | undefined;
}

export interface PublisherLike extends DisplayNameLike {
  /**
   * File objects carry `url: null` on the wire, so the id is what resolves an
   * avatar (`getFileUrl`). `url` wins when the API/CDN provides one.
   */
  picture?: PictureLike | null;
  profile?: { picture?: PictureLike | null } | null;
}

/** A publisher/account picture: a drive file identity plus placeholder data. */
export type PictureLike = Omit<FileLike, "id"> & { id?: string | null };

/** Prefer nick over the account/publisher name, like FloatLand. */
export function getDisplayName(
  publisher: DisplayNameLike | null | undefined,
): string {
  return publisher?.nick || publisher?.name || "Unknown";
}

/** Up to two initials for placeholder avatars. */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * The picture file an avatar renders from: the profile picture first, then the
 * publisher picture — the first one that can produce an image (a direct `url`
 * or a drive file id).
 */
export function getAvatarFile(
  publisher: PublisherLike | null | undefined,
): PictureLike | undefined {
  for (const picture of [publisher?.profile?.picture, publisher?.picture]) {
    if (picture?.url || picture?.id) return picture;
  }
  return undefined;
}

/**
 * Avatar image URL: the picture's direct URL, else its drive file id (the wire
 * sends `url: null`) — see `getFileUrl`. `baseUrl` is the element's API origin
 * (`base-url`, else `configure({ baseUrl })`).
 */
export function getAvatarUrl(
  publisher: PublisherLike | null | undefined,
  baseUrl?: string,
): string | undefined {
  const picture = getAvatarFile(publisher);
  if (!picture) return undefined;
  return picture.url || getFileUrl(picture.id, { baseUrl });
}

/**
 * Compact count for post stats (`1200` → `1.2K`, `1500000` → `1.5M`), mirroring
 * FloatLand's `formatNumber`.
 */
export function formatCount(count: number): string {
  if (!Number.isFinite(count)) return "0";
  const abs = Math.abs(count);
  if (abs >= 1_000_000) {
    const scaled = count / 1_000_000;
    return `${scaled.toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  }
  if (abs >= 1_000) {
    const scaled = count / 1_000;
    return `${scaled.toFixed(abs >= 10_000 ? 0 : 1)}K`;
  }
  return String(count);
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
