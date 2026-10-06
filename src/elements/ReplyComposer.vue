<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import {
  ApiClient,
  API_BASE_URL,
  PostsApi,
  type SnAccount,
  type SnPublisher,
} from "../api";
import { getConfig, onConfigChange, toStylesheetList } from "../config";
import { dispatchWindowEvent, REPLY_POSTED_EVENT } from "../events";
import { getSession, type SessionState } from "../session";
import { getAvatarUrl, getDisplayName, getInitials } from "../utils/format";
import { getHostElement, markHost } from "../utils/host";
import AvatarImage from "./AvatarImage.vue";
import SolarPassMark from "./SolarPassMark.vue";

/**
 * Reply composer for a parent post.
 *
 * Signed in (session state): renders a textarea + submit button and posts the
 * reply via `POST /sphere/posts?pub=<publisher>` with `replied_post_id = post`.
 * The publisher defaults to the signed-in account's first publisher
 * (`GET /sphere/publishers/of/{accountId}`) and can be pinned with the `pub`
 * attribute.
 *
 * Signed out: shows the branded "Sign in with Solarpass" button, which signs in
 * through the platform identity provider (OIDC + PKCE in a popup window — see
 * `sk-login`). The host page is not navigated, so a signed-in composer appears
 * in place as soon as the popup relays its code.
 *
 * Deliberately UNSTYLED; opt into the preset via `configure({ css })`
 * or the `css` attribute (see `sk-replies-list`).
 *
 * Attributes:
 * - `post` (required): parent post id
 * - `pub`: pin the publisher to post as (default: the user picks from the
 *   account's publishers, starting with the first — like FloatLand's composer)
 * - `client-id`, `issuer`, `redirect-uri`, `scopes`, `mode`: Solarpass OIDC
 *   settings (same as `sk-login`; `client-id` may come from `configure`)
 * - `label`: sign-in button text (default "Sign in with Solarpass")
 * - `icon`: icon URL overriding the built-in Solar mark; `icon=""` hides it
 * - `placeholder`: textarea placeholder
 * - `submit-label`: submit button label (default "Reply")
 * - `max-length`: character limit (default 5000)
 * - `css`, `base-url`: as on the other elements
 *
 * Events (dispatched on the host element; bubble and are composed):
 * - `reply-posted` with `detail = { postId, post }` — also broadcast as
 *   `sunkenland:reply-posted` on `window` so `sk-replies-list` re-fetches
 *
 * Slots:
 * - `sign-in` — replaces the whole signed-out block (hint + button)
 * - `error`   — replaces the error message text
 *
 * The publisher switcher lists `GET /sphere/publishers?mine=true` with each
 * publisher's avatar, display name and `@handle`; the current one is checked
 * and the choice applies to the next submitted reply (set `pub` to pin it and
 * hide the switcher).
 *
 * Styling: `--sk-*` custom properties (see `presets/reply-composer.css`) plus
 * `part`s on every internal node (`guest`, `hint`, `button`, `logo`, `label`,
 * `form`, `meta`, `publisher`, `publisher-toggle`, `publisher-avatar`,
 * `publisher-name`, `publisher-list`, `publisher-empty`, `as`, `input`, `bar`,
 * `count`, `submit`, `error`):
 *
 *   sk-reply-composer::part(submit) { background: rebeccapurple; }
 */

const props = withDefaults(
  defineProps<{
    post: string;
    pub?: string;
    /** OIDC client id (registered app). Falls back to `configure({ oidc })`. */
    clientId?: string;
    issuer?: string;
    redirectUri?: string;
    scopes?: string;
    /** `popup` (default) or `redirect`. */
    mode?: "popup" | "redirect";
    label?: string;
    icon?: string;
    placeholder?: string;
    submitLabel?: string;
    maxLength?: number;
    css?: string;
    baseUrl?: string;
  }>(),
  {
    label: "Sign in with Solarpass",
    mode: "popup",
    placeholder: "Write a reply…",
    submitLabel: "Reply",
    maxLength: 5000,
  },
);

const loadingLabel = "Signing in…";
const iconSrc = computed(() => props.icon || undefined);
const scopes = computed(() =>
  props.scopes ? props.scopes.split(/[\s,]+/).filter(Boolean) : undefined,
);

const rootEl = ref<HTMLElement | null>(null);

const cfg = getConfig();
const session = getSession();
const client = new ApiClient({
  baseUrl: props.baseUrl || cfg.baseUrl || API_BASE_URL,
  fetchImpl: cfg.fetchImpl,
  getAccessToken: cfg.getAccessToken ?? session.getAccessToken,
  refreshAccessToken: cfg.refreshAccessToken ?? session.refreshAccessToken,
  onUnauthorized: cfg.onUnauthorized ?? session.onUnauthorized,
});
const posts = new PostsApi(client);

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
const stopSession = session.subscribe((snap) => {
  state.value = snap.state;
  user.value = snap.user;
  sessionError.value = snap.error;
});
onUnmounted(stopSession);

const content = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);

// ── Publisher selection (mirrors FloatLand's compose switcher) ────────────
const publishers = ref<SnPublisher[]>([]);
const currentPublisher = ref<SnPublisher | null>(null);
const pickerOpen = ref(false);
const loadingPublishers = ref(false);
const publishersError = ref<string | null>(null);

const signedIn = computed(() => state.value === "signed-in");
/** A pinned `pub` attribute means the host chose the publisher for the user. */
const pinned = computed(() => Boolean(props.pub));
const publisherName = computed(() => currentPublisher.value?.nick || currentPublisher.value?.name || "");
const publisherHandle = computed(() => currentPublisher.value?.name ?? "");
const publisherAvatar = computed(() => getAvatarUrl(currentPublisher.value, client.baseUrl));
const canSubmit = computed(
  () =>
    signedIn.value &&
    content.value.trim().length > 0 &&
    !submitting.value &&
    !loadingPublishers.value &&
    currentPublisher.value !== null,
);
const charCount = computed(() => content.value.length);

// Complete an in-flight OIDC redirect / popup callback for this page.
onMounted(() => {
  markHost(rootEl.value, "sk-composer");
  void session.syncProvisioned();
  void session.resumeAuth();
  if (signedIn.value) void loadPublishers();
  document.addEventListener("click", onDocumentClick);
});
onUnmounted(() => document.removeEventListener("click", onDocumentClick));

watch(signedIn, (value) => {
  if (value) void loadPublishers();
});

/** Load the account's publishers and default to the first (like FloatLand). */
async function loadPublishers(): Promise<void> {
  loadingPublishers.value = true;
  publishersError.value = null;
  try {
    const list = await posts.fetchMyPublishers();
    publishers.value = list;
    if (props.pub) {
      // Host-pinned publisher: prefer the matching entry for its display data.
      currentPublisher.value =
        list.find((pub) => pub.name === props.pub) ?? pinnedPublisher(props.pub);
      return;
    }
    const stillValid = list.find((pub) => pub.id === currentPublisher.value?.id);
    currentPublisher.value = stillValid ?? list[0] ?? null;
  } catch (err) {
    currentPublisher.value = pinnedPublisher(props.pub ?? "");
    publishersError.value =
      err instanceof Error ? err.message : "Could not load publishers.";
  } finally {
    loadingPublishers.value = false;
  }
}

/** Minimal publisher stand-in when only a name is known. */
function pinnedPublisher(name: string): SnPublisher | null {
  if (!name) return null;
  return {
    id: `pin:${name}`,
    name,
    nick: null,
    bio: null,
    picture: null,
    background: null,
    verification: null,
    account: null,
    createdAt: "",
  };
}

function selectPublisher(pub: SnPublisher): void {
  currentPublisher.value = pub;
  pickerOpen.value = false;
}

function togglePicker(): void {
  if (pinned.value) return;
  pickerOpen.value = !pickerOpen.value;
}

function onDocumentClick(event: MouseEvent): void {
  if (!pickerOpen.value) return;
  const path = event.composedPath();
  const root = rootEl.value;
  if (root && path.includes(root)) return;
  pickerOpen.value = false;
}

async function startLogin(): Promise<void> {
  error.value = null;
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
    error.value =
      err instanceof Error ? err.message : "Sign-in could not be started.";
  }
}

async function submit(): Promise<void> {
  if (!props.post) {
    error.value = "Missing required `post` attribute.";
    return;
  }
  const target = currentPublisher.value?.name;
  if (!target) {
    error.value = publishersError.value ?? "No publisher to post as.";
    return;
  }
  const text = content.value.trim();
  if (!text || submitting.value) return;

  submitting.value = true;
  error.value = null;
  try {
    const post = await posts.createReply(props.post, text, {
      publisher: target,
    });
    const detail = { postId: props.post, post };
    rootEl.value?.dispatchEvent(
      new CustomEvent("reply-posted", {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
    dispatchWindowEvent(REPLY_POSTED_EVENT, detail);
    content.value = "";
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to post reply.";
  } finally {
    submitting.value = false;
  }
}

// Mirror the error message onto the host element (`data-error`), like the
// other elements. `flush: "post"` so the first error lands after mount.
watch(
  [error, sessionError],
  () => {
    const host = getHostElement(rootEl.value);
    if (!host) return;
    const message = error.value ?? sessionError.value;
    if (message) host.setAttribute("data-error", message);
    else host.removeAttribute("data-error");
  },
  { flush: "post" },
);
</script>

<template>
  <section ref="rootEl" class="sk-composer" :aria-label="`Reply to post ${post}`">
    <link
      v-for="href in stylesheets"
      :key="href"
      rel="stylesheet"
      :href="href"
    />

    <div v-if="!signedIn" class="sk-composer__guest" part="guest">
      <slot name="sign-in">
        <p class="sk-composer__hint" part="hint">Sign in to reply</p>
        <button
          type="button"
          class="sk-composer__solarpass"
          part="button"
          :disabled="state === 'loading'"
          @click="startLogin"
        >
          <span
            v-if="iconSrc"
            class="sk-composer__logo sk-composer__logo--image"
            part="logo"
            aria-hidden="true"
          >
            <img :src="iconSrc" alt="" />
          </span>
          <span
            v-else-if="icon !== ''"
            class="sk-composer__logo"
            part="logo"
            aria-hidden="true"
          >
            <SolarPassMark />
          </span>
          <span class="sk-composer__label" part="label">
            {{ state === "loading" ? loadingLabel : label }}
          </span>
        </button>
      </slot>
    </div>

    <form
      v-else
      class="sk-composer__form"
      part="form"
      @submit.prevent="submit"
    >
      <div class="sk-composer__meta" part="meta">
        <div class="sk-composer__publisher" part="publisher">
          <button
            type="button"
            class="sk-composer__publisher-toggle"
            part="publisher-toggle"
            :disabled="pinned || publishers.length === 0"
            :aria-expanded="pickerOpen"
            aria-haspopup="listbox"
            :title="pinned ? `Posting as @${publisherHandle}` : 'Choose a publisher'"
            @click.stop="togglePicker"
          >
            <span class="sk-composer__publisher-avatar" part="publisher-avatar" aria-hidden="true">
              <AvatarImage
                v-if="publisherAvatar"
                :publisher="currentPublisher"
                :base-url="client.baseUrl"
              />
              <template v-else>{{ currentPublisher ? getInitials(publisherName) : "?" }}</template>
            </span>
            <span class="sk-composer__publisher-name" part="publisher-name">
              {{ currentPublisher ? publisherName : "No publisher" }}
            </span>
            <span v-if="publisherHandle" class="sk-composer__publisher-handle">
              @{{ publisherHandle }}
            </span>
          </button>

          <ul
            v-if="pickerOpen"
            class="sk-composer__publisher-list"
            part="publisher-list"
            role="listbox"
            @click.stop
          >
            <li v-for="pub in publishers" :key="pub.id">
              <button
                type="button"
                class="sk-composer__publisher-option"
                role="option"
                :aria-selected="pub.id === currentPublisher?.id"
                :class="{ 'sk-composer__publisher-option--active': pub.id === currentPublisher?.id }"
                @click="selectPublisher(pub)"
              >
                <span class="sk-composer__publisher-avatar" aria-hidden="true">
                  <AvatarImage
                    v-if="getAvatarUrl(pub, client.baseUrl)"
                    :publisher="pub"
                    :base-url="client.baseUrl"
                  />
                  <template v-else>{{ getInitials(getDisplayName(pub)) }}</template>
                </span>
                <span class="sk-composer__publisher-option-text">
                  <span class="sk-composer__publisher-name">{{ getDisplayName(pub) }}</span>
                  <span class="sk-composer__publisher-handle">@{{ pub.name }}</span>
                </span>
              </button>
            </li>
            <li v-if="publishers.length === 0" class="sk-composer__publisher-empty" part="publisher-empty">
              No publishers to post as
            </li>
          </ul>
        </div>
        <span v-if="loadingPublishers" class="sk-composer__as sk-composer__as--pending" part="as">
          Loading publishers…
        </span>
        <span v-else-if="publishersError" class="sk-composer__as sk-composer__as--pending" part="as">
          {{ publishersError }}
        </span>
      </div>

      <textarea
        v-model="content"
        class="sk-composer__input"
        part="input"
        :placeholder="placeholder"
        :maxlength="maxLength"
        rows="3"
        aria-label="Reply content"
      />

      <div class="sk-composer__bar" part="bar">
        <span class="sk-composer__count" :class="{ 'sk-composer__count--full': charCount >= maxLength }" part="count">
          {{ charCount }}/{{ maxLength }}
        </span>
        <button
          type="submit"
          class="sk-composer__submit"
          part="submit"
          :disabled="!canSubmit"
        >
          {{ submitting ? "Posting…" : submitLabel }}
        </button>
      </div>
    </form>

    <p v-if="error" class="sk-composer__error" part="error" role="alert">
      <slot name="error">{{ error }}</slot>
    </p>
  </section>
</template>
