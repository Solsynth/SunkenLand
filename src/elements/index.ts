/**
 * SunkenLand embeddable elements.
 *
 * Importing this module registers every `sk-*` element (idempotent — existing
 * tags are left alone). The IIFE bundle used from a CDN is this entry point,
 * so `<script src="…/sunken-land.iife.js">` makes all elements available.
 */

import { defineRepliesList } from "./replies-list";
import { defineLogin } from "./login";
import { defineReactionList } from "./reaction-list";
import { defineReplyComposer } from "./reply-composer";
import { defineMedia, defineMediaCollection } from "./media";
import { definePost } from "./post";
import { defineUsername } from "./username";

defineRepliesList();
defineLogin();
defineReactionList();
defineReplyComposer();
defineMedia();
defineMediaCollection();
defineUsername();
definePost();

export { RepliesListElement, defineRepliesList } from "./replies-list";
export { LoginElement, defineLogin } from "./login";
export { ReactionListElement, defineReactionList } from "./reaction-list";
export { ReplyComposerElement, defineReplyComposer } from "./reply-composer";
export {
  MediaFileElement,
  MediaCollectionElement,
  defineMedia,
  defineMediaCollection,
} from "./media";
export { UsernameElement, defineUsername } from "./username";
export { PostElement, definePost } from "./post";

// Drive-file helpers: the API sends `url: null` and serves files from
// `…/drive/files/{id}`, so hosts rendering the same files need the same URL
// shape (`getFileUrl`), plus the media-kind detection and the unlazy
// placeholder inputs (`getBlurhash` / `getImageSize`) the elements use.
export {
  getFileUrl,
  getFileKind,
  getAspectRatio,
  getBlurhash,
  getImageSize,
} from "../utils/files";
export type { FileLike, FileKind, HashLike } from "../utils/files";

// Markdown rendering for post/reply bodies (dependency-free, HTML-escaping,
// http(s)/mailto links only) and the count formatting the stats use.
export { renderMarkdown, escapeHtml } from "../utils/markdown";
export { formatCount } from "../utils/format";

// The platform's reaction set and the symbol normalization every surface that
// reads `reactions_count` / `reactions_made` needs (`sk-reaction-list`,
// `sk-post`).
export {
  AVAILABLE_REACTIONS,
  REACTIONS_BY_SYMBOL,
  buildReactionChips,
  getReaction,
  normalizeReactionSymbol,
  normalizeReactionSymbols,
  reactionStickerSrc,
} from "../utils/reactions";
export type { AvailableReaction, ReactionChip } from "../utils/reactions";

// Identity/time formatting shared with the elements (avatar resolution
// included: `getAvatarUrl` falls back to the drive file id).
export {
  getAvatarFile,
  getAvatarUrl,
  getDisplayName,
  getInitials,
  formatRelativeTime,
} from "../utils/format";
export type { PublisherLike, PictureLike } from "../utils/format";

// Colourful-username rules (`sk-username` and any host rendering the same
// names): the palette, the Stellar tier gate, the membership defaults, and the
// mark geometry.
export {
  USERNAME_PLAIN_COLORS,
  USERNAME_TIER_COLORS,
  USERNAME_TIER_NAMES,
  USERNAME_VERIFICATION_COLORS,
  USERNAME_VERIFICATION_MARKS,
  USERNAME_MEMBERSHIP_MARK,
  USERNAME_BOT_MARK,
  canUseUsernameColor,
  getUsernameTier,
  hasActiveMembership,
  membershipColor,
  membershipLabel,
  resolveUsernameColor,
  usernameColorStyle,
  verificationColor,
  verificationLabel,
  verificationMark,
} from "../utils/username";
export type { UsernameColorSource } from "../utils/username";

// Library-wide configuration: stylesheet presets, API origin, auth hooks,
// session override.
export { configure, getConfig, onConfigChange, CONFIG_EVENT } from "../config";
export type { SunkenLandConfig } from "../config";

// OAuth session state shared by the elements (tokens, login/callback, signout).
export {
  SunkenLandSession,
  session,
  getSession,
  SESSION_STORAGE_KEY,
  PENDING_AUTH_KEY,
  OIDC_MESSAGE_TYPE,
  localStorageSessionStorage,
  inMemorySessionStorage,
} from "../session";
export type {
  SessionState,
  SessionSnapshot,
  SessionStorage,
  OidcDefaults,
  SignInWithOidcOptions,
} from "../session";

// Session-aware API access for endpoints the elements don't cover.
export { apiFetch, createApiClient } from "../fetch";
export type { ApiFetchOptions } from "../fetch";

// OpenID Connect client (Solarpass) — usable standalone by hosts.
export {
  DEFAULT_OIDC_ISSUER,
  DEFAULT_OIDC_SCOPES,
  buildAuthorizeUrl,
  createOidcNonce,
  createOidcState,
  createPkcePair,
  decodeJwtPayload,
  defaultRedirectUri,
  discoverOidc,
  exchangeOidcCode,
  fetchOidcUserInfo,
  refreshOidcToken,
} from "../oidc";
export type {
  OidcDiscovery,
  OidcTokenResponse,
  OidcUserInfo,
  AuthorizeUrlParams,
} from "../oidc";

// Cross-element window events (signin/signout/auth-error/reply-posted).
export {
  SIGNIN_EVENT,
  SIGNOUT_EVENT,
  AUTH_ERROR_EVENT,
  REPLY_POSTED_EVENT,
  dispatchWindowEvent,
  onWindowEvent,
} from "../events";

// Re-export the API layer so hosts can drive the backend directly.
export * from "../api";
