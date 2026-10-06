import { defineCustomElement } from "vue";
import MediaCollection from "./MediaCollection.vue";
import MediaFile from "./MediaFile.vue";

/**
 * `sk-media` and `sk-media-collection` custom elements.
 *
 * Importing this module registers both tags (`sk-media`, `sk-media-collection`);
 * `defineMedia(tag)` / `defineMediaCollection(tag)` register them under custom
 * tag names instead.
 *
 * Each tag gets its own element class (a custom element constructor may only be
 * registered with the registry once), so multiple calls with different tags all
 * work.
 *
 * See `MediaFile.vue` (one file) and `MediaCollection.vue` (a list) for the
 * attribute / property / event contracts.
 */
export const MediaFileElement = defineCustomElement(MediaFile);
export const MediaCollectionElement = defineCustomElement(MediaCollection);

export function defineMedia(tag = "sk-media") {
  // The registry only exists in the browser: importing this module on the
  // server (Nuxt/Nitro SSR, vitest node) must not throw.
  if (typeof customElements === "undefined") return undefined;
  if (!customElements.get(tag)) {
    customElements.define(tag, defineCustomElement(MediaFile));
  }
  return customElements.get(tag);
}

export function defineMediaCollection(tag = "sk-media-collection") {
  if (typeof customElements === "undefined") return undefined;
  if (!customElements.get(tag)) {
    customElements.define(tag, defineCustomElement(MediaCollection));
  }
  return customElements.get(tag);
}

defineMedia();
defineMediaCollection();
