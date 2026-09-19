/**
 * SunkenLand embeddable elements.
 *
 * Importing this module registers every `sk-*` element (idempotent — existing
 * tags are left alone). The IIFE bundle used from a CDN is this entry point,
 * so `<script src="…/sunk-enland.iife.js">` makes all elements available.
 */

import { defineRepliesList } from "./replies-list";

defineRepliesList();

export { RepliesListElement, defineRepliesList } from "./replies-list";

// Library-wide configuration: stylesheet presets, API origin, auth hooks.
export { configure, getConfig, onConfigChange, CONFIG_EVENT } from "../config";
export type { SunkenLandConfig } from "../config";

// Re-export the API layer so hosts can drive the backend directly.
export * from "../api";
