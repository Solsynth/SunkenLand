<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { AccountApi, ApiClient, API_BASE_URL } from "../api";
import { getConfig, onConfigChange, toStylesheetList } from "../config";
import { getSession } from "../session";
import { getHostElement, markHost } from "../utils/host";
import { flagAttr } from "../utils/attrs";
import {
  getUsernameTier,
  hasActiveMembership,
  membershipColor,
  membershipLabel,
  USERNAME_BOT_MARK,
  USERNAME_MEMBERSHIP_MARK,
  usernameColorStyle,
  verificationColor,
  verificationLabel,
  verificationMark,
  type UsernameColorSource,
  type UsernameData,
  type UsernameVerification,
} from "../utils/username";

/**
 * A colourful username — the embeddable port of FloatLand's `AccountName.vue`:
 * the display name (`nick` over `name`) in the profile's custom colour, with
 * the membership, verification, and bot marks beside it.
 *
 * The colour rules live in `../utils/username`: a profile may carry a custom
 * `usernameColor`, but the Stellar tier gates it (`primary` → named palette
 * colours, `nova` → any plain colour, `supernova` → gradients too). A custom
 * colour the tier does not allow is dropped, and only a profile with no custom
 * colour gets the tier's default membership colour. `ignore-permissions` skips
 * the gate.
 *
 * What to render comes from, in order of precedence:
 *
 * 1. the `publisher` property — the author object posts and replies embed
 *    (name + `account.profile.usernameColor` + `account.perkSubscription` +
 *    publisher-level verification), so a host that already holds a post needs
 *    no request;
 * 2. the `account` property — a full account object, no request;
 * 3. the `account` attribute — an account id **or** name, resolved through
 *    `GET /stargate/accounts/{account}` (a public read);
 * 4. the `name`/`nick` attributes — a bare string, no request.
 *
 * Explicit attributes override the resolved data field by field (`color`,
 * `colors`/`direction`, `tier`, `verified`, `bot`), so the element is also
 * usable with nothing but attributes.
 *
 * Deliberately UNSTYLED; opt into the preset via `configure({ css })` or the
 * `css` attribute (see `sk-replies-list`).
 *
 * Attributes:
 * - `account`: account id or name — `account="8792577d-…"`
 * - `name`, `nick`: the display name without any request (`nick` wins)
 * - `color`: plain colour, a palette name (`pink`) or hex (`#ec4899`)
 * - `colors`: gradient stops, comma separated — implies `type: "gradient"`
 * - `direction`: gradient direction (default `to right`)
 * - `tier`: Stellar tier (`solian.stellar.primary|nova|supernova`) — gates
 *   `color`/`colors` and supplies the default membership colour
 * - `verified`: show the verification mark — a bare attribute is type `0`,
 *   `verified="2"` picks a type
 * - `verified-title`, `verified-description`: the mark's tooltip text
 * - `bot`: show the automated mark
 * - `size`: `sm`, `md` (default) or `lg`
 * - `bold`: `bold="false"` renders the name at normal weight
 * - `url`: makes the element a link — opened on click unless canceled
 * - `ignore-permissions`: render the custom colour even when the tier denies it
 * - `css`, `base-url`: as on the other elements
 *
 * Properties:
 * - `publisher`: the post/reply publisher object (JavaScript-only)
 * - `account`: `string | SnAccount` — an id/name, or the account object itself
 *
 * Events (dispatched on the host element; bubbles and composed):
 * - `username-click` with `detail = { name, account, publisher, url }`.
 *   Cancelable: `preventDefault()` suppresses the default action, which is
 *   opening `url` in a new tab (nothing otherwise).
 *
 * Slots (light-DOM children, projected into the shadow root):
 * - `loading` — replaces the "Loading name..." status
 * - `error` — replaces the error message (also mirrored on the host as
 *   `data-error`)
 * - `suffix` — extra marks after the built-in ones, like FloatLand's slot
 *
 * Styling: the `presets/username.css` preset (`--sk-username-*` custom
 * properties) plus a `part` on every internal node: `name`, `verification`,
 * `membership`, `bot`, `suffix`, `state`, `error`.
 *
 *   sk-username::part(name) { letter-spacing: 0.02em; }
 */

const props = withDefaults(
  defineProps<{
    /** Account id or name to resolve (fetched), or the account object itself. */
    account?: string | UsernameData | null;
    /** The post/reply publisher object; JavaScript-only (no request). */
    publisher?: UsernameData | null;
    name?: string;
    nick?: string;
    color?: string;
    colors?: string;
    direction?: string;
    tier?: string;
    verified?: string | number | boolean;
    verifiedTitle?: string;
    verifiedDescription?: string;
    /**
     * Boolean attributes arrive as strings (`bold="false"`), so these accept
     * both — `utils/attrs.flagAttr` reads them.
     */
    bot?: boolean | string;
    size?: string;
    bold?: boolean | string;
    url?: string;
    ignorePermissions?: boolean | string;
    css?: string;
    baseUrl?: string;
  }>(),
  {
    account: null,
    publisher: null,
    size: "md",
    bold: true,
    bot: false,
    ignorePermissions: false,
  },
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
const accounts = new AccountApi(client);

// Stylesheets re-sync when `configure(...)` is called after mount.
const configVersion = ref(0);
const stopConfigSync = onConfigChange(() => {
  configVersion.value++;
});
onUnmounted(stopConfigSync);

onMounted(() => {
  markHost(rootEl.value, "sk-username");
});

const stylesheets = computed<string[]>(() => {
  void configVersion.value;
  if (props.css !== undefined) return props.css ? [props.css] : [];
  return toStylesheetList(getConfig().css);
});

const fetched = ref<UsernameData | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const isBold = computed(() => flagAttr(props.bold, true));
const isBot = computed(() => flagAttr(props.bot, false));
const ignorePermissions = computed(() => flagAttr(props.ignorePermissions, false));

/** The id/name to fetch: only the string form of `account` is a reference. */
const accountRef = computed(() =>
  typeof props.account === "string" ? props.account.trim() : "",
);

async function load(): Promise<void> {
  const ref_ = accountRef.value;
  if (!ref_) {
    fetched.value = null;
    loading.value = false;
    return;
  }
  if (props.publisher) {
    fetched.value = null;
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    fetched.value = await accounts.fetchAccount(ref_);
  } catch (err) {
    fetched.value = null;
    error.value = err instanceof Error ? err.message : "Failed to load the account.";
  } finally {
    loading.value = false;
  }
}

/**
 * A publisher carries its own name/`verification` and embeds the account that
 * holds the colour and the Stellar tier — flatten the two so every field
 * resolves from one object.
 */
function mergePublisher(publisher: UsernameData): UsernameData {
  const account = publisher.account;
  if (!account) return publisher;
  return {
    ...account,
    name: publisher.name ?? account.name,
    nick: publisher.nick ?? account.nick,
    verification: publisher.verification ?? account.verification,
  };
}

/**
 * The data the name renders from: the publisher first (the object a post
 * already carries), then an account object, then the fetched account.
 */
const resolved = computed<UsernameData | null>(() => {
  if (props.publisher) return mergePublisher(props.publisher);
  if (props.account && typeof props.account === "object") return props.account;
  return fetched.value;
});

const displayName = computed(() => {
  const inline = props.nick || props.name;
  if (inline) return inline;
  const data = resolved.value;
  return data?.nick || data?.name || "";
});

/** The custom colour: the inline attributes override the resolved profile. */
const colorSource = computed<UsernameColorSource | null>(() => {
  const data = resolved.value;
  const inline = props.color || props.colors;
  if (inline) {
    return {
      usernameColor: {
        type: props.colors ? "gradient" : "plain",
        value: props.color ?? null,
        colors: props.colors
          ? props.colors.split(/[\s,]+/).filter(Boolean)
          : null,
        direction: props.direction ?? null,
      },
      perkSubscription: { identifier: props.tier ?? null, isActive: true },
    };
  }
  if (!data) return null;
  return {
    usernameColor: data.profile?.usernameColor ?? null,
    perkSubscription: {
      identifier: props.tier ?? getUsernameTier(data) ?? null,
      isActive: hasActiveMembership(data),
    },
  };
});

const nameStyle = computed(() =>
  usernameColorStyle(colorSource.value, ignorePermissions.value),
);

/** The tier the colour was gated by: the inline attribute, else the wire's. */
const resolvedTier = computed(() => getUsernameTier(colorSource.value));

/** The verification mark: `verified` overrides, else the resolved record. */
const verification = computed<UsernameVerification | null>(() => {
  if (props.verified !== undefined && props.verified !== false && String(props.verified) !== "false") {
    const parsed = Number.parseInt(String(props.verified), 10);
    return {
      type: Number.isNaN(parsed) ? 0 : parsed,
      title: props.verifiedTitle ?? null,
      description: props.verifiedDescription ?? null,
    };
  }
  const data = resolved.value;
  return data?.verification ?? data?.profile?.verification ?? null;
});

const showMembership = computed(() => {
  if (props.tier) return true;
  return hasActiveMembership(resolved.value);
});

const showBot = computed(
  () => isBot.value || !!resolved.value?.automatedId,
);

const nameMarkup = computed(() => verificationMark(verification.value?.type ?? 0));
const nameMarkColor = computed(() => verificationColor(verification.value?.type ?? 0));
const verificationText = computed(() => verificationLabel(verification.value));
const memberMarkColor = computed(() => membershipColor(resolvedTier.value));
const memberText = computed(() => membershipLabel(resolvedTier.value));

/** `url` turns the element into a link: clickable, focusable, keyboard-safe. */
const clickable = computed(() => !!props.url);
const clickableAttrs = computed(() =>
  clickable.value ? { role: "link", tabindex: "0" } : {},
);

// Mirror the error message onto the host element so hosts overriding the
// `error` slot can still read it. `flush: "post"` ensures the first
// (synchronous) error lands after the shadow tree is mounted.
watch(
  error,
  (message) => {
    const host = getHostElement(rootEl.value);
    if (!host) return;
    if (message) host.setAttribute("data-error", message);
    else host.removeAttribute("data-error");
  },
  { flush: "post" },
);

watch(
  () => [props.account, props.publisher],
  () => void load(),
  { immediate: true },
);

/**
 * Nothing to render from at all: no object, no id, no name. Reported rather
 * than rendering an empty name, so a host sees the wiring mistake — and cleared
 * the moment a source arrives (a fetch failure sets its own error).
 */
const missingInput = computed(
  () =>
    !props.publisher &&
    !props.name &&
    !props.nick &&
    !accountRef.value &&
    !(props.account && typeof props.account === "object"),
);

watch(
  missingInput,
  (missing) => {
    error.value = missing
      ? "Missing `account` (id or name), `publisher`, `name`, or `nick`."
      : null;
  },
  { immediate: true },
);

/**
 * Re-dispatch the click on the host (`username-click`, cancelable) and, unless
 * the host cancels it, open `url` — an embedded name has no navigation of its
 * own, so a host must opt in with `url`.
 */
function onClick(): void {
  const event = new CustomEvent("username-click", {
    detail: {
      name: displayName.value,
      account: typeof props.account === "object" ? props.account : null,
      publisher: props.publisher ?? null,
      url: props.url ?? null,
    },
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  const proceed = rootEl.value?.dispatchEvent(event) ?? true;
  if (proceed && props.url) {
    window.open(props.url, "_blank", "noopener,noreferrer");
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!clickable.value || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  onClick();
}
</script>

<template>
  <section
    ref="rootEl"
    class="sk-username"
    :data-size="props.size"
    :data-bold="isBold ? '' : undefined"
    :data-clickable="clickable ? '' : undefined"
    :aria-busy="loading"
    v-bind="clickableAttrs"
    @click="onClick"
    @keydown="onKeydown"
  >
    <link
      v-for="href in stylesheets"
      :key="href"
      rel="stylesheet"
      :href="href"
    />

    <span
      v-if="displayName"
      class="sk-username__name"
      :style="nameStyle"
      part="name"
      :title="displayName"
    >{{ displayName }}</span>

    <svg
      v-if="displayName && verification"
      class="sk-username__mark sk-username__mark--verification"
      part="verification"
      viewBox="0 0 24 24"
      :style="{ color: nameMarkColor }"
      role="img"
      aria-hidden="false"
    >
      <title>{{ verificationText }}</title>
      <g
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        v-html="nameMarkup"
      />
    </svg>

    <svg
      v-if="displayName && showMembership"
      class="sk-username__mark sk-username__mark--membership"
      part="membership"
      viewBox="0 0 24 24"
      :style="{ color: memberMarkColor }"
      role="img"
      aria-hidden="false"
    >
      <title>{{ memberText }}</title>
      <g
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        v-html="USERNAME_MEMBERSHIP_MARK"
      />
    </svg>

    <svg
      v-if="displayName && showBot"
      class="sk-username__mark sk-username__mark--bot"
      part="bot"
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="false"
    >
      <title>Automated</title>
      <g
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        v-html="USERNAME_BOT_MARK"
      />
    </svg>

    <span v-if="displayName" class="sk-username__suffix" part="suffix">
      <slot name="suffix" />
    </span>

    <div
      v-if="loading && !displayName"
      class="sk-state"
      part="state"
      role="status"
    >
      <slot name="loading">Loading name...</slot>
    </div>
    <div
      v-if="error && !displayName"
      class="sk-state sk-state--error"
      part="error"
      role="alert"
    >
      <slot name="error">{{ error }}</slot>
    </div>
  </section>
</template>
