import { defineCustomElement } from "vue";
import LoginButton from "./LoginButton.vue";

/**
 * `sk-login` custom element — OAuth sign-in widget with a Google-style
 * "Sign in with Solarpass" button.
 *
 * Importing this module registers the element under its standard tag
 * (`sk-login`). Use `defineLogin(tag)` to register it under a custom tag name
 * instead. See `LoginButton.vue` for the full attribute / event / slot
 * contract.
 */
export const LoginElement = defineCustomElement(LoginButton);

export function defineLogin(tag = "sk-login") {
  if (!customElements.get(tag)) {
    customElements.define(tag, defineCustomElement(LoginButton));
  }
  return customElements.get(tag);
}

defineLogin();
