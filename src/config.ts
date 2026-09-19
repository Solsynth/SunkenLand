import type { ApiClientConfig } from "./api/client";

/**
 * Library-wide configuration for the embeddable elements.
 *
 * `SunkenLand.configure(...)` is the single extension point hosts use to set
 * things that apply to every element — API origin, authentication hooks,
 * fetch overrides, and injectable presets (currently the preset stylesheets,
 * with future injectable features extending this object).
 *
 * Call it once at startup, typically right after the bundle loads:
 *
 *   // CDN (IIFE) — `SunkenLand` is the global
 *   SunkenLand.configure({ baseUrl: "https://api.example.com", stylesheets: "https://cdn…/presets/replies-list.css" });
 *
 *   // npm (ESM)
 *   import { configure } from "sunk-enland";
 *   configure({ stylesheets: ["/presets/base.css", "/presets/replies-list.css"] });
 *
 * `baseUrl`/`fetchImpl`/auth hooks are read when an element is created, so
 * call `configure` before elements are connected for those. `stylesheets`
 * re-syncs live: already-mounted elements pick up new stylesheets (and drop
 * removed ones) automatically.
 *
 * Per-element attributes still win:
 * - the `base-url` attribute overrides `baseUrl`
 * - the `css` attribute (or `css=""`) overrides `stylesheets` for that element
 */

export interface SunkenLandConfig extends ApiClientConfig {
  /**
   * Preset stylesheet(s) injected into every element's shadow root as
   * `<link rel="stylesheet">`, exactly as an embedding host would load them
   * from a CDN. An element's own `css` attribute overrides this.
   */
  stylesheets?: string | string[];
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

/** Normalize `stylesheets` to a string array. */
export function toStylesheetList(
  stylesheets: string | string[] | undefined,
): string[] {
  if (!stylesheets) return [];
  return Array.isArray(stylesheets) ? stylesheets : [stylesheets];
}
