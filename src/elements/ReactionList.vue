<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import {
  ApiClient,
  API_BASE_URL,
  camelToSnakeStr,
  PostsApi,
  type SnPost,
} from "../api";
import { getConfig, onConfigChange, toStylesheetList } from "../config";
import { getSession, type SessionState } from "../session";
import { getHostElement, markHost } from "../utils/host";

/**
 * Reaction bar for a post — the embeddable port of FloatLand's
 * `PostReactionList.vue`: one chip per reaction on the post (sticker/emoji +
 * count, highlighted when it is yours) plus an "React" picker with the
 * platform's reaction set.
 *
 * Reads the post (`GET /sphere/posts/{post}`) for `reactionsCount` and, when
 * the page carries a session, `reactionsMade` — so a signed-in visitor sees
 * their own reactions highlighted. Toggling is optimistic (the chip updates
 * immediately) and rolls back if the request fails.
 *
 * Signed out: counts are still shown (the read is public) but reacting starts
 * the Solarpass sign-in flow — a popup by default, so the host page is not
 * navigated (`client-id`/`issuer`/`redirect-uri`/`scopes`/`mode` as on
 * `sk-login` and `sk-reply-composer`).
 *
 * Deliberately UNSTYLED; opt into the preset via `configure({ css })`
 * or the `css` attribute (see `sk-replies-list`).
 *
 * Attributes:
 * - `post` (required): post id
 * - `max-visible`: chips shown before the "+N" toggle (default 5)
 * - `picker`: show the "React" add-reaction picker (default true; `picker="false"`
 *   renders the chips only)
 * - `react-label`: picker button text (default "React"; `react-label=""` shows
 *   the icon alone)
 * - `sticker-url`: URL template for sticker images, `{symbol}` replaced by the
 *   reaction symbol (e.g. `https://solian.app/stickers/{symbol}.webp`).
 *   Defaults to `configure({ stickerUrl })` (the shipped `dist/stickers/`
 *   set); without either, reactions render as emoji, and `sticker-url=""`
 *   turns stickers off for this element.
 * - `client-id`, `issuer`, `redirect-uri`, `scopes`, `mode`: Solarpass OIDC
 *   settings used when a guest reacts
 * - `css`, `base-url`: as on the other elements
 *
 * Events (dispatched on the host element; bubble and are composed):
 * - `reaction-added` with `detail = { postId, symbol, attitude, count }`
 * - `reaction-removed` with the same shape
 *
 * Slots (light-DOM children, projected into the shadow root):
 * - `picker` — replaces the whole reaction menu (fallback: the built-in set),
 *   for translations or a custom reaction catalog
 * - `empty`  — replaces the "No reactions yet" state (only with `picker="false"`)
 * - `error`  — replaces the error message text
 *
 * Styling: `--sk-*` custom properties (see `presets/reactions.css`) plus a
 * `part` on every internal node (`list`, `trigger`, `trigger-icon`,
 * `trigger-label`, `menu`, `option`, `option-label`, `chip`, `emoji`,
 * `sticker`, `count`, `more`, `empty`, `error`). A chip you reacted to also
 * carries `data-reacted="true"`, and every chip carries `data-symbol`:
 *
 *   sk-reaction-list::part(chip) { border-radius: 9999px; }
 */

interface AvailableReaction {
  symbol: string;
  emoji: string;
  label: string;
  attitude: number;
}

/** FloatLand's reaction set ("positive" 0, "neutral" 1, "negative" 2). */
const AVAILABLE_REACTIONS: AvailableReaction[] = [
  { symbol: "thumb_up", emoji: "👍", label: "Like", attitude: 0 },
  { symbol: "heart", emoji: "❤️", label: "Love", attitude: 0 },
  { symbol: "clap", emoji: "👏", label: "Clap", attitude: 0 },
  { symbol: "laugh", emoji: "😂", label: "Laugh", attitude: 0 },
  { symbol: "party", emoji: "🎉", label: "Party", attitude: 0 },
  { symbol: "salute", emoji: "🫡", label: "Salute", attitude: 0 },
  { symbol: "pray", emoji: "🙏", label: "Pray", attitude: 1 },
  { symbol: "hello", emoji: "👋", label: "Hello", attitude: 1 },
  { symbol: "shock", emoji: "😱", label: "Shock", attitude: 1 },
  { symbol: "confuse", emoji: "🧐", label: "Confused", attitude: 1 },
  { symbol: "cry", emoji: "😭", label: "Cry", attitude: 1 },
  { symbol: "speechless", emoji: "😶", label: "Speechless", attitude: 1 },
  { symbol: "ridicule", emoji: "😏", label: "Ridicule", attitude: 1 },
  { symbol: "angry", emoji: "😡", label: "Angry", attitude: 2 },
  { symbol: "thumb_down", emoji: "👎", label: "Dislike", attitude: 2 },
];

const REACTIONS_BY_SYMBOL = new Map(
  AVAILABLE_REACTIONS.map((reaction) => [reaction.symbol, reaction]),
);

/**
 * Reaction symbols arrive camelCased from some endpoints (`thumbUp`), and the
 * client's response conversion camelCases the keys of the `reactionsCount` /
 * `reactionsMade` maps on top of that. Everything inside the element works
 * with the canonical `thumb_up` form — which is also what the API expects on
 * the wire when reacting or removing.
 */
function normalizeSymbol(symbol: string): string {
  return camelToSnakeStr(symbol).toLowerCase();
}

function normalizeSymbols<T>(map: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [symbol, value] of Object.entries(map)) {
    out[normalizeSymbol(symbol)] = value;
  }
  return out;
}

const props = withDefaults(
  defineProps<{
    post: string;
    maxVisible?: number;
    picker?: boolean;
    reactLabel?: string;
    stickerUrl?: string;
    /** OIDC client id (registered app). Falls back to `configure({ oidc })`. */
    clientId?: string;
    issuer?: string;
    redirectUri?: string;
    scopes?: string;
    /** `popup` (default) or `redirect`. */
    mode?: "popup" | "redirect";
    css?: string;
    baseUrl?: string;
  }>(),
  { maxVisible: 5, picker: true, reactLabel: "React", mode: "popup" },
);

const scopes = computed(() =>
  props.scopes ? props.scopes.split(/[\s,]+/).filter(Boolean) : undefined,
);
/**
 * Custom-element attributes always arrive as strings: bare `picker` and
 * `picker=""` mean "on", while `picker="false"` means off.
 */
const showPicker = computed(
  () => props.picker !== false && String(props.picker) !== "false",
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

/** Per-element `sticker-url`, else the configured template ("" disables). */
const stickerTemplate = computed(() => {
  void configVersion.value;
  return props.stickerUrl !== undefined
    ? props.stickerUrl
    : getConfig().stickerUrl;
});

const state = shallowRef<SessionState>(session.state);
const signedIn = computed(() => state.value === "signed-in");
const stopSession = session.subscribe((snap) => {
  const wasSignedIn = state.value === "signed-in";
  state.value = snap.state;
  // Signing in/out changes which reactions are "mine" — re-read the post.
  if (wasSignedIn !== (snap.state === "signed-in")) void load();
});
onUnmounted(stopSession);

/**
 * Bumped by every local reaction mutation. A read that started before a
 * mutation must not apply its (now stale) snapshot on top of it.
 */
let revisions = 0;

/** Counts and whether *I* reacted, mirroring FloatLand's local reaction state. */
const counts = ref<Record<string, number>>({});
const mine = ref<Record<string, boolean>>({});
const pending = ref<Record<string, boolean>>({});
const loaded = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const menuOpen = ref(false);
const showAll = ref(false);

const chips = computed(() =>
  Object.entries(counts.value).map(([symbol, count]) => {
    const known = REACTIONS_BY_SYMBOL.get(normalizeSymbol(symbol));
    return {
      symbol,
      count,
      reacted: Boolean(mine.value[symbol]),
      label: known?.label ?? symbol,
      emoji: known?.emoji ?? "❓",
      attitude: known?.attitude ?? 0,
    };
  }),
);

const visibleChips = computed(() =>
  showAll.value ? chips.value : chips.value.slice(0, props.maxVisible),
);
const hasMore = computed(() => chips.value.length > props.maxVisible);

function stickerSrc(symbol: string): string | undefined {
  const template = stickerTemplate.value;
  if (!template) return undefined;
  return template.replace(/\{symbol\}/g, normalizeSymbol(symbol));
}

function isMine(symbol: string): boolean {
  return Boolean(mine.value[symbol]);
}

function chipTitle(symbol: string, label: string): string {
  return signedIn.value
    ? `${label} — click to ${isMine(symbol) ? "remove" : "add"}`
    : `${label} — sign in to react`;
}

/** Local, optimistic mutation of a reaction (one entry per symbol). */
function applyLocal(symbol: string, reacted: boolean, delta: number): void {
  revisions++;
  const next = Math.max(0, (counts.value[symbol] ?? 0) + delta);
  if (next === 0 && !reacted) {
    // Last reaction of its kind removed — drop the chip, like FloatLand.
    const rest = { ...counts.value };
    delete rest[symbol];
    counts.value = rest;
  } else {
    counts.value = { ...counts.value, [symbol]: next };
  }
  mine.value = { ...mine.value, [symbol]: reacted };
}

function setPending(symbol: string, value: boolean): void {
  pending.value = { ...pending.value, [symbol]: value };
}

function dispatchReaction(
  name: "reaction-added" | "reaction-removed",
  symbol: string,
  attitude: number,
): void {
  rootEl.value?.dispatchEvent(
    new CustomEvent(name, {
      detail: {
        postId: props.post,
        symbol,
        attitude,
        count: counts.value[symbol] ?? 0,
      },
      bubbles: true,
      composed: true,
    }),
  );
}

async function toggle(symbol: string, attitude: number): Promise<void> {
  if (!props.post) {
    error.value = "Missing required `post` attribute.";
    return;
  }
  if (!signedIn.value) {
    await startLogin();
    return;
  }
  if (pending.value[symbol]) return;

  const wasMine = isMine(symbol);
  const delta = wasMine ? -1 : 1;
  setPending(symbol, true);
  error.value = null;
  applyLocal(symbol, !wasMine, delta);

  try {
    if (wasMine) await posts.removeReaction(props.post, symbol);
    else await posts.reactToPost(props.post, symbol, attitude);
    dispatchReaction(wasMine ? "reaction-removed" : "reaction-added", symbol, attitude);
  } catch (err) {
    applyLocal(symbol, wasMine, -delta);
    error.value =
      err instanceof Error
        ? err.message
        : wasMine
          ? "Could not remove the reaction."
          : "Could not add the reaction.";
  } finally {
    setPending(symbol, false);
  }
}

/** Picker selection: add the reaction, or take it back when it is already mine. */
async function pick(reaction: AvailableReaction): Promise<void> {
  menuOpen.value = false;
  await toggle(reaction.symbol, reaction.attitude);
}

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

function onDocumentClick(event: MouseEvent): void {
  if (!menuOpen.value) return;
  const root = rootEl.value;
  if (root && event.composedPath().includes(root)) return;
  menuOpen.value = false;
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

let loadSeq = 0;

async function load(): Promise<void> {
  if (!props.post) {
    error.value = "Missing required `post` attribute.";
    return;
  }
  const seq = ++loadSeq;
  const revision = revisions;
  loading.value = true;
  try {
    const post: SnPost = await posts.fetchPost(props.post);
    // Superseded by a newer load, or a reaction changed locally meanwhile.
    if (seq !== loadSeq || revision !== revisions) return;
    counts.value = normalizeSymbols(post.reactionsCount);
    mine.value = normalizeSymbols(post.reactionsMade ?? {});
    loaded.value = true;
    error.value = null;
  } catch (err) {
    if (seq !== loadSeq) return;
    error.value =
      err instanceof Error ? err.message : "Could not load reactions.";
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

watch(
  () => props.post,
  () => {
    showAll.value = false;
    menuOpen.value = false;
    loaded.value = false;
    void load();
  },
);

onMounted(() => {
  markHost(rootEl.value, "sk-reactions");
  void session.syncProvisioned();
  void load();
  document.addEventListener("click", onDocumentClick);
});
onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
});

// Mirror the error message onto the host element (`data-error`), like the
// other elements. `flush: "post"` so the first error lands after mount.
watch(
  error,
  () => {
    const host = getHostElement(rootEl.value);
    if (!host) return;
    if (error.value) host.setAttribute("data-error", error.value);
    else host.removeAttribute("data-error");
  },
  { flush: "post" },
);
</script>

<template>
  <section
    ref="rootEl"
    class="sk-reactions"
    :aria-label="`Reactions to post ${post}`"
    :aria-busy="loading ? 'true' : undefined"
  >
    <link
      v-for="href in stylesheets"
      :key="href"
      rel="stylesheet"
      :href="href"
    />

    <div
      v-if="loaded && (chips.length > 0 || showPicker)"
      class="sk-reactions__list"
      part="list"
    >
      <div v-if="showPicker" class="sk-reactions__picker">
        <button
          type="button"
          class="sk-reactions__trigger"
          part="trigger"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          :title="signedIn ? 'Add a reaction' : 'Sign in to react'"
          @click.stop="toggleMenu"
        >
          <svg
            class="sk-reactions__trigger-icon"
            part="trigger-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-9-9" />
            <path d="M8.5 14.5s1.2 1.5 3.5 1.5 3.5-1.5 3.5-1.5" />
            <path d="M9 9.5h.01M15 9.5h.01" />
            <path d="M19 3v6M16 6h6" />
          </svg>
          <span
            v-if="reactLabel"
            class="sk-reactions__trigger-label"
            part="trigger-label"
            >{{ reactLabel }}</span
          >
        </button>

        <div
          v-if="menuOpen"
          class="sk-reactions__menu"
          part="menu"
          role="menu"
          @click.stop
          @keydown.esc="menuOpen = false"
        >
          <slot name="picker">
            <button
              v-for="reaction in AVAILABLE_REACTIONS"
              :key="reaction.symbol"
              type="button"
              role="menuitemcheckbox"
              class="sk-reactions__option"
              part="option"
              :class="{ 'sk-reactions__option--mine': isMine(reaction.symbol) }"
              :data-symbol="reaction.symbol"
              :aria-checked="isMine(reaction.symbol)"
              :aria-label="reaction.label"
              :title="chipTitle(reaction.symbol, reaction.label)"
              :disabled="pending[reaction.symbol]"
              @click="pick(reaction)"
            >
              <img
                v-if="stickerSrc(reaction.symbol)"
                class="sk-reactions__sticker"
                part="sticker"
                :src="stickerSrc(reaction.symbol)"
                :alt="reaction.label"
              />
              <span v-else class="sk-reactions__emoji" part="emoji" aria-hidden="true">{{
                reaction.emoji
              }}</span>
              <span class="sk-reactions__option-label" part="option-label">{{
                reaction.label
              }}</span>
            </button>
          </slot>
        </div>
      </div>

      <button
        v-for="chip in visibleChips"
        :key="chip.symbol"
        type="button"
        class="sk-reactions__chip"
        part="chip"
        :class="{ 'sk-reactions__chip--mine': chip.reacted }"
        :data-symbol="chip.symbol"
        :data-reacted="chip.reacted ? 'true' : undefined"
        :aria-pressed="chip.reacted"
        :title="chipTitle(chip.symbol, chip.label)"
        :disabled="pending[chip.symbol]"
        @click.stop="toggle(chip.symbol, chip.attitude)"
      >
        <img
          v-if="stickerSrc(chip.symbol)"
          class="sk-reactions__sticker"
          part="sticker"
          :src="stickerSrc(chip.symbol)"
          :alt="chip.label"
        />
        <span v-else class="sk-reactions__emoji" part="emoji" aria-hidden="true">{{
          chip.emoji
        }}</span>
        <span class="sk-reactions__count" part="count">{{ chip.count }}</span>
      </button>

      <button
        v-if="hasMore"
        type="button"
        class="sk-reactions__more"
        part="more"
        :aria-expanded="showAll"
        @click.stop="showAll = !showAll"
      >
        +{{ chips.length - maxVisible }}
      </button>
    </div>

    <slot v-else-if="loaded" name="empty">
      <span class="sk-reactions__empty" part="empty">No reactions yet</span>
    </slot>

    <p v-if="error" class="sk-reactions__error" part="error" role="alert">
      <slot name="error">{{ error }}</slot>
    </p>
  </section>
</template>
