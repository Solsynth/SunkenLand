import { defineCustomElement } from "vue";
import ReplyComposer from "./ReplyComposer.vue";

/**
 * `sk-reply-composer` custom element — reply box for a parent post.
 *
 * Signed out it shows the "Sign in with Solarpass" button; signed in it posts
 * replies as the account's publisher. Importing this module registers the
 * element under its standard tag (`sk-reply-composer`); use
 * `defineReplyComposer(tag)` for a custom tag. See `ReplyComposer.vue` for the
 * full attribute / event / slot contract.
 */
export const ReplyComposerElement = defineCustomElement(ReplyComposer);

export function defineReplyComposer(tag = "sk-reply-composer") {
  // The registry only exists in the browser: importing this module on the
  // server (Nuxt/Nitro SSR, vitest node) must not throw.
  if (typeof customElements === "undefined") return undefined;
  if (!customElements.get(tag)) {
    customElements.define(tag, defineCustomElement(ReplyComposer));
  }
  return customElements.get(tag);
}

defineReplyComposer();
