import { defineCustomElement } from "vue";
import PostCard from "./PostCard.vue";

/**
 * `sk-post` custom element — one whole post.
 *
 * Importing this module registers the tag (`sk-post`); `definePost(tag)`
 * registers it under a custom tag name instead.
 *
 * See `PostCard.vue` (the port of FloatLand's component of the same name) for the attribute / property / event contract. The pieces it
 * shares with the other elements live in `utils/`: the Markdown renderer
 * (`utils/markdown`), the reaction catalog (`utils/reactions`), the colourful
 * name rules (`utils/username`), and the media grid component.
 */
export const PostElement = defineCustomElement(PostCard);

export function definePost(tag = "sk-post") {
  // The registry only exists in the browser: importing this module on the
  // server (Nuxt/Nitro SSR, vitest node) must not throw.
  if (typeof customElements === "undefined") return undefined;
  if (!customElements.get(tag)) {
    customElements.define(tag, defineCustomElement(PostCard));
  }
  return customElements.get(tag);
}

definePost();
