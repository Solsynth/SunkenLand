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

defineRepliesList();
defineLogin();
defineReactionList();
defineReplyComposer();

export { RepliesListElement, defineRepliesList } from "./replies-list";
export { LoginElement, defineLogin } from "./login";
export { ReactionListElement, defineReactionList } from "./reaction-list";
export { ReplyComposerElement, defineReplyComposer } from "./reply-composer";

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
