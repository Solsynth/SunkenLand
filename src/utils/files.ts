/**
 * Solian drive-file helpers shared by the elements.
 *
 * The API returns file objects (`publisher.picture`, `post.attachments`, …)
 * with `url: null` — the bytes are served from the drive endpoint by id:
 *
 *   https://api.solian.app/drive/files/{id}
 *
 * FloatLand resolves every image/video/avatar through `getFileUrl`, so the
 * elements must too: reading `file.url` alone renders initials where an avatar
 * exists. `url` still wins when a host (or a future CDN) supplies one, and a
 * `?thumbnail=true` variant is available for files that carry one.
 *
 * Mirrors FloatLand's `app/utils/files.ts` and `app/utils/fileType.ts` so both
 * frontends agree on URL shapes and kind detection.
 */

import { API_BASE_URL } from "../api/client";

/** Everything the helpers read off a file object. */
export interface FileLike {
  id: string;
  name?: string | null;
  /** Direct URL when the API/CDN provides one; usually `null`. */
  url?: string | null;
  mimeType?: string | null;
  hasCompression?: boolean;
  hasThumbnail?: boolean;
  /** BlurHash at the top level (some endpoints) or under `file_meta`. */
  blurhash?: string | null;
  /** Server-side metadata: `width`, `height`, `ratio`, `blurhash`, … */
  fileMeta?: Record<string, unknown> | null;
}

/** What the placeholder helpers need — narrower than `FileLike`, so publisher
 * pictures and post attachments both qualify. */
export interface HashLike {
  blurhash?: string | null;
  fileMeta?: Record<string, unknown> | null;
}

/** What kind of media a file renders as. */
export type FileKind = "image" | "video" | "audio" | "file";

/**
 * Absolute URL for a drive file. Returns `undefined` without an id.
 *
 * - `baseUrl` — API origin (per-element `base-url`, else `configure({ baseUrl })`,
 *   else `https://api.solian.app`). Defaults to the package's API origin.
 * - `variant` — query flag, e.g. `"thumbnail"` → `?thumbnail=true`.
 */
export function getFileUrl(
  fileId: string | null | undefined,
  options: { baseUrl?: string | null; variant?: string } = {},
): string | undefined {
  if (!fileId) return undefined;
  const base = (options.baseUrl || API_BASE_URL).replace(/\/+$/, "");
  const url = `${base}/drive/files/${encodeURIComponent(fileId)}`;
  return options.variant ? `${url}?${options.variant}=true` : url;
}

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "mov", "mkv", "avi", "flv", "m4v", "3gp"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "flac", "aac", "wma", "opus"];

/**
 * Which media kind a file renders as. The MIME type drives the decision; the
 * filename extension is the fallback when the server sends a generic or
 * missing type (FloatLand's rule).
 */
export function getFileKind(file: FileLike): FileKind {
  const mimeType = file.mimeType ?? "";
  const parts = (file.name ?? "").split(".");
  const extension =
    parts.length > 1 ? (parts[parts.length - 1] ?? "").toLowerCase() : "";
  const generic = !mimeType || mimeType === "application/octet-stream";

  if (mimeType.startsWith("image/") || (generic && IMAGE_EXTENSIONS.includes(extension))) {
    return "image";
  }
  if (mimeType.startsWith("video/") || (generic && VIDEO_EXTENSIONS.includes(extension))) {
    return "video";
  }
  if (mimeType.startsWith("audio/") || (generic && AUDIO_EXTENSIONS.includes(extension))) {
    return "audio";
  }
  return "file";
}

function metaNumber(file: HashLike, key: string): number | undefined {
  const value = file.fileMeta?.[key];
  if (typeof value === "number" && value > 0) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (parsed > 0) return parsed;
  }
  return undefined;
}

/**
 * BlurHash for a file's placeholder image. The API nests it in `file_meta`
 * (`file_meta.blurhash`); some endpoints also send it at the top level.
 */
export function getBlurhash(file: HashLike | null | undefined): string | undefined {
  const value = file?.blurhash ?? file?.fileMeta?.["blurhash"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Intrinsic pixel size from a file's metadata, when the server sent both
 * axes. Passed to the image element (`width`/`height`) so the blurhash
 * placeholder decodes at the right aspect ratio.
 */
export function getImageSize(
  file: HashLike | null | undefined,
): { width: number; height: number } | undefined {
  if (!file) return undefined;
  const width = metaNumber(file, "width");
  const height = metaNumber(file, "height");
  return width && height ? { width, height } : undefined;
}

/**
 * Aspect ratio (width / height) from possibly-partial metadata, falling back
 * to `4 / 3` like FloatLand's attachment grid when nothing usable is present.
 */
export function getAspectRatio(file: FileLike): number {
  const width = metaNumber(file, "width");
  const height = metaNumber(file, "height");
  if (width && height) return width / height;
  return metaNumber(file, "ratio") ?? 4 / 3;
}
