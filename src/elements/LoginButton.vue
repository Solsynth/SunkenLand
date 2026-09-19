<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import type { SnAccount } from "../api";
import { getConfig, onConfigChange, toStylesheetList } from "../config";
import { getSession, type SessionState } from "../session";
import { getHostElement, markHost } from "../utils/host";
import { getDisplayName, getInitials } from "../utils/format";
import SolarPassMark from "./SolarPassMark.vue";

/**
 * OAuth login widget for embedded hosts.
 *
 * Renders a single Google-style branded button — "Sign in with Solarpass" —
 * that signs the visitor in through the platform identity provider using
 * **OpenID Connect (authorization code + PKCE) in a popup window**: the host
 * page is never navigated, and no client secret lives in the browser.
 *
 * Attributes:
 * - `client-id`: registered OIDC app id (falls back to
 *   `configure({ oidc: { clientId } })`) — required to sign in
 * - `issuer`: issuer base URL (default `https://api.solian.app`)
 * - `redirect-uri`: registered redirect URI (default: this page's origin + path)
 * - `scopes`: space/comma separated (default `openid profile email`)
 * - `mode`: `popup` (default) or `redirect` (navigates this page instead)
 * - `label`: button text (default "Sign in with Solarpass")
 * - `icon`: icon URL overriding the built-in Solar mark; `icon=""` hides it
 * - `css`: per-element stylesheet URL override (`css=""` disables styling)
 * - `base-url`: per-element API origin override
 *
 * Events (dispatched on the host element; bubble and are composed):
 * - `sign-in`  — session transitioned to signed-in
 * - `sign-out` — session transitioned to signed-out (e.g. after clicking Sign out)
 *
 * Slots:
 * - `sign-in`   — replaces the whole signed-out block (hint + button)
 * - `signed-in` — replaces the whole signed-in block (user + sign out)
 *
 * The login button is optional: a host that already holds a credential can set
 * `configure({ token })` (or `getAccessToken`) and the elements render the
 * signed-in state without anyone clicking Sign in. Sign out is hidden in that
 * case — the host owns the credential's lifetime.
 *
 * Styling: the preset is driven by `--sk-*` custom properties (see
 * `presets/login.css`) and every internal node carries a `part`
 * (`button`, `logo`, `label`, `guest`, `error`, `user`, `avatar`, `name`,
 * `signout`) for direct external styling:
 *
 *   sk-login::part(button) { border: 2px dashed rebeccapurple; }
 *
 * Session state is shared page-wide via the session singleton
 * (`configure({ session })` to override); sign-in/sign-out also broadcast
 * `sunkenland:signin` / `sunkenland:signout` on `window`.
 */

const props = withDefaults(
  defineProps<{
    /** OIDC client id (registered app). Falls back to `configure({ oidc })`. */
    clientId?: string;
    /** Issuer base URL (default `https://api.solian.app`). */
    issuer?: string;
    /** Registered redirect URI (default: this page). */
    redirectUri?: string;
    /** Space- or comma-separated scopes (default `openid profile email`). */
    scopes?: string;
    /** `popup` (default) or `redirect`. */
    mode?: "popup" | "redirect";
    label?: string;
    icon?: string;
    css?: string;
    baseUrl?: string;
  }>(),
  { label: "Sign in with Solarpass", mode: "popup" },
);

const loadingLabel = "Signing in…";
const iconSrc = computed(() => props.icon || undefined);
const scopes = computed(() =>
  props.scopes
    ? props.scopes.split(/[\s,]+/).filter(Boolean)
    : undefined,
);

const rootEl = ref<HTMLElement | null>(null);

const session = getSession();

// Stylesheets re-sync when `configure(...)` is called after mount.
const configVersion = ref(0);
const stopConfigSync = onConfigChange(() => {
  configVersion.value++;
});
onUnmounted(stopConfigSync);

const stylesheets = computed<string[]>(() => {
  void configVersion.value;
  if (props.css !== undefined) return props.css ? [props.css] : [];
  return toStylesheetList(getConfig().css);
});

const state = shallowRef<SessionState>(session.state);
const user = shallowRef<SnAccount | null>(session.user);
const sessionError = shallowRef<string | null>(session.error);
/** Errors raised by starting the flow (missing client id, discovery failure). */
const localError = ref<string | null>(null);
/** The host supplied the credential (`configure({ token })`): it owns Sign out. */
const external = ref(session.externallyProvisioned);

let prevState = session.state;
const stopSession = session.subscribe((snap) => {
  if (rootEl.value && snap.state !== prevState) {
    if (snap.state === "signed-in") {
      rootEl.value.dispatchEvent(
        new CustomEvent("sign-in", { bubbles: true, composed: true }),
      );
    } else if (prevState === "signed-in" && snap.state === "signed-out") {
      rootEl.value.dispatchEvent(
        new CustomEvent("sign-out", { bubbles: true, composed: true }),
      );
    }
  }
  prevState = snap.state;
  state.value = snap.state;
  user.value = snap.user;
  sessionError.value = snap.error;
  external.value = session.externallyProvisioned;
});
onUnmounted(stopSession);

// Complete an in-flight OIDC redirect / popup callback for this page.
onMounted(() => {
  markHost(rootEl.value, "sk-login");
  void session.syncProvisioned();
  void session.resumeAuth();
});

const displayName = computed(() => getDisplayName(user.value));

async function startLogin(): Promise<void> {
  localError.value = null;
  try {
    await session.signInWithOidc({
      clientId: props.clientId,
      issuer: props.issuer,
      redirectUri: props.redirectUri,
      scopes: scopes.value,
      mode: props.mode,
    });
  } catch (err) {
    // Configuration-level failures (missing client id, discovery) throw;
    // user-level outcomes land in the session's error state instead.
    localError.value =
      err instanceof Error ? err.message : "Sign-in could not be started.";
  }
}

async function signOut(): Promise<void> {
  await session.signOut();
}

// Keep the host element's `data-error` in sync (same contract as sk-replies-list).
watch(
  [sessionError, localError],
  () => {
    const host = getHostElement(rootEl.value);
    if (!host) return;
    const message = localError.value ?? sessionError.value;
    if (message) host.setAttribute("data-error", message);
    else host.removeAttribute("data-error");
  },
  { flush: "post" },
);
</script>

<template>
  <section ref="rootEl" class="sk-login">
    <link
      v-for="href in stylesheets"
      :key="href"
      rel="stylesheet"
      :href="href"
    />

    <div v-if="state === 'signed-in' && user" class="sk-login__user" part="user">
      <slot name="signed-in">
        <span class="sk-login__avatar" part="avatar" aria-hidden="true">
          {{ getInitials(displayName) }}
        </span>
        <span class="sk-login__name" part="name">{{ displayName }}</span>
        <button
          v-if="!external"
          type="button"
          class="sk-login__signout"
          part="signout"
          @click="signOut"
        >
          Sign out
        </button>
      </slot>
    </div>

    <div v-else class="sk-login__guest" part="guest">
      <slot name="sign-in">
        <p v-if="localError || sessionError" class="sk-login__error" part="error" role="alert">
          {{ localError ?? sessionError }}
        </p>
        <button
          type="button"
          class="sk-login__solarpass"
          part="button"
          :disabled="state === 'loading'"
          @click="startLogin"
        >
          <span
            v-if="iconSrc"
            class="sk-login__logo sk-login__logo--image"
            part="logo"
            aria-hidden="true"
          >
            <img :src="iconSrc" alt="" />
          </span>
          <span
            v-else-if="icon !== ''"
            class="sk-login__logo"
            part="logo"
            aria-hidden="true"
          >
            <SolarPassMark />
          </span>
          <span class="sk-login__label" part="label">
            {{ state === "loading" ? loadingLabel : label }}
          </span>
        </button>
      </slot>
    </div>
  </section>
</template>
