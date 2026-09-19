import { defineCustomElement } from "vue";
import ReactionList from "./ReactionList.vue";

/**
 * `sk-reaction-list` custom element.
 *
 * Importing this module registers the element under its standard tag
 * (`sk-reaction-list`). Use `defineReactionList(tag)` to register it under a
 * custom tag name instead.
 *
 * Each tag gets its own element class (a custom element constructor may only
 * be registered with the registry once), so multiple `defineReactionList`
 * calls with different tags all work.
 *
 * See `ReactionList.vue` for the full attribute / event contract.
 */
export const ReactionListElement = defineCustomElement(ReactionList);

export function defineReactionList(tag = "sk-reaction-list") {
  // The registry only exists in the browser: importing this module on the
  // server (Nuxt/Nitro SSR, vitest node) must not throw.
  if (typeof customElements === "undefined") return undefined;
  if (!customElements.get(tag)) {
    customElements.define(tag, defineCustomElement(ReactionList));
  }
  return customElements.get(tag);
}

defineReactionList();
