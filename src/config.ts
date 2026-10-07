import type { ApiClientConfig } from "./api/client";
import type { OidcDefaults, SunkenLandSession } from "./session";

/**
 * Library-wide configuration for the embeddable elements.
 *
 * `SunkenLand.configure(...)` is the single extension point hosts use to set
 * everything that applies to every element: API origin, preset stylesheets,
 * and the Solarpass OIDC client (client id, issuer, redirect URI, scopes).
 * Every knob here mirrors an element attribute, and the attribute wins for
 * that element.
 *
 *   // CDN (IIFE) — `SunkenLand` is the global
 *   SunkenLand.configure({
 *     css: "https://cdn…/presets/replies-list.css",
 *     oidc: { clientId: "my-app", redirectUri: "https://my.site/page" },
 *   });
 *
 *   // npm (ESM)
 *   import { configure } from "@solsynth/sunkenland";
 *   configure({ css: ["/presets/base.css", "/presets/replies-list.css"] });
 *
 * `baseUrl`/`fetchImpl`/auth hooks/`session` are read when an element is
 * created, so call `configure` before elements are connected for those. `css`
 * re-syncs live: already-mounted elements pick up new stylesheets (and drop
 * removed ones) automatically.
 *
 * Per-element attributes still win:
 * - `base-url` overrides `baseUrl`
 * - `css` (or `css=""`) overrides the configured `css` for that element
 * - `client-id`/`issuer`/`redirect-uri`/`scopes`/`mode` override `oidc`
 */

export interface SunkenLandConfig extends ApiClientConfig {
  /**
   * A ready-made access token (bearer) for the whole page. Use it when the
   * host already holds a credential — the login button becomes optional: the
   * elements authenticate with this token and render the signed-in state,
   * resolving the account from the API. Takes precedence over a session
   * obtained through sign-in, and cannot be refreshed (supply a fresh token
   * when it expires). `getAccessToken` does the same for dynamic tokens.
   */
  token?: string;

  /**
   * Sticker image URL template for `sk-reaction-list`, with `{symbol}`
   * replaced by the reaction symbol — e.g.
   * `https://cdn.solian.app/stickers/{symbol}.webp`. The set ships with the
   * package (`dist/stickers/*.webp`, 15 offered reactions + 5 extra symbols),
   * so a host serving `dist/` can use a path relative to the page. Without it
   * reactions render as emoji. The element's `sticker-url` attribute overrides
   * this; `sticker-url=""` turns stickers off for that element.
   */
  stickerUrl?: string;

  /**
   * Preset stylesheet(s) injected into every element's shadow root as
   * `<link rel="stylesheet">`, exactly as an embedding host would load them
   * from a CDN. An element's own `css` attribute overrides this.
   */
  css?: string | string[];

  /**
   * OAuth session instance. Defaults to the package's `session` singleton
   * (localStorage-backed). Supply your own `SunkenLandSession` to change the
   * storage (sessionStorage, in-memory, per-tenant key) or to run isolated
   * sessions (e.g. per widget instance in a test harness).
   */
  session?: SunkenLandSession;

  /**
   * Solarpass / OpenID Connect defaults, applied to every element's sign-in:
   * `clientId` (required to sign in — register an app first), `issuer`,
   * `redirectUri`, `scopes`, and `mode` (`popup` | `redirect`).
   */
  oidc?: OidcDefaults;
}

/** Dispatched on `window` after every `configure` call. */
export const CONFIG_EVENT = "sunkenland:configure";

let current: SunkenLandConfig = {};

/** Merge `config` into the library-wide settings. Returns the merged config. */
export function configure(config: SunkenLandConfig): Readonly<SunkenLandConfig> {
  current = { ...current, ...config };
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<SunkenLandConfig>(CONFIG_EVENT, { detail: current }),
    );
  }
  return current;
}

/** Current merged configuration (read-only). */
export function getConfig(): Readonly<SunkenLandConfig> {
  return current;
}

/** Subscribe to configuration changes; returns an unsubscribe function. */
export function onConfigChange(
  listener: (config: Readonly<SunkenLandConfig>) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    listener((event as CustomEvent<SunkenLandConfig>).detail);
  };
  window.addEventListener(CONFIG_EVENT, handler);
  return () => window.removeEventListener(CONFIG_EVENT, handler);
}

/** Normalize a `css` value to a list of stylesheet hrefs. */
export function toStylesheetList(css: string | string[] | undefined): string[] {
  if (!css) return [];
  return Array.isArray(css) ? css : [css];
}
