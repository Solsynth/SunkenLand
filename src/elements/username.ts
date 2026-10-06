import { defineCustomElement } from "vue";
import AccountName from "./AccountName.vue";

/**
 * `sk-username` custom element — one colourful username.
 *
 * Importing this module registers the tag (`sk-username`); `defineUsername(tag)`
 * registers it under a custom tag name instead.
 *
 * See `AccountName.vue` (the port of FloatLand's component of the same name)
 * for the attribute / property / event contract, and `utils/username.ts` for
 * the colour rules (palette, Stellar tier gate, membership colours) it shares
 * with any host rendering the same names.
 */
export const UsernameElement = defineCustomElement(AccountName);

export function defineUsername(tag = "sk-username") {
  // The registry only exists in the browser: importing this module on the
  // server (Nuxt/Nitro SSR, vitest node) must not throw.
  if (typeof customElements === "undefined") return undefined;
  if (!customElements.get(tag)) {
    customElements.define(tag, defineCustomElement(AccountName));
  }
  return customElements.get(tag);
}

defineUsername();
