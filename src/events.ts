/**
 * Cross-element window events.
 *
 * The embeddable elements are separate custom elements on the host page; they
 * coordinate through plain `window` CustomEvents so any element (or the host
 * itself) can react without coupling. All events are `CustomEvent`s whose
 * `detail` is documented per constant.
 */

/** Session completed the OAuth code exchange; `detail = { user }`. */
export const SIGNIN_EVENT = "sunkenland:signin";

/** Session was signed out; no detail. */
export const SIGNOUT_EVENT = "sunkenland:signout";

/** Login failed (OAuth error param or code exchange failure); `detail = { error }`. */
export const AUTH_ERROR_EVENT = "sunkenland:auth-error";

/**
 * A reply was posted; `detail = { postId, post }`. Dispatched by
 * `sk-reply-composer` after a successful `POST /sphere/posts`; `sk-replies-list`
 * re-fetches when the event's `postId` matches its own `post` attribute.
 */
export const REPLY_POSTED_EVENT = "sunkenland:reply-posted";

/** Dispatch a window CustomEvent (no-op outside browsers). */
export function dispatchWindowEvent(
  name: string,
  detail?: unknown,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Subscribe to a window CustomEvent; returns an unsubscribe function. */
export function onWindowEvent(
  name: string,
  listener: (event: CustomEvent) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => listener(event as CustomEvent);
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}
