import { defineCustomElement } from "vue";
import RepliesList from "./RepliesList.vue";

/**
 * `sk-replies-list` custom element.
 *
 * Importing this module registers the element under its standard tag
 * (`sk-replies-list`). Use `defineRepliesList(tag)` to register it under a
 * custom tag name instead.
 *
 * Each tag gets its own element class (a custom element constructor may only
 * be registered with the registry once), so multiple `defineRepliesList`
 * calls with different tags all work.
 *
 * See `RepliesList.vue` for the full attribute / event contract.
 */
export const RepliesListElement = defineCustomElement(RepliesList);

export function defineRepliesList(tag = "sk-replies-list") {
  if (!customElements.get(tag)) {
    customElements.define(tag, defineCustomElement(RepliesList));
  }
  return customElements.get(tag);
}

defineRepliesList();
