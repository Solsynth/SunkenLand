<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ApiClient, API_BASE_URL, DriveApi, type SnFileAttachment } from "../api";
import { getConfig, onConfigChange, toStylesheetList } from "../config";
import { getSession } from "../session";
import type { FileLike } from "../utils/files";
import { getHostElement, markHost } from "../utils/host";
import { flagAttr } from "../utils/attrs";
import MediaGrid from "./MediaGrid.vue";

/**
 * A LIST of drive files — a post's attachments, a gallery of ids — the
 * embeddable port of FloatLand's `AttachmentGrid`: one file fills a box at its
 * aspect ratio (with a blurred backdrop copy in `flush` presentation), several
 * become a horizontal snapping list with a `n/total` counter, scroll arrows,
 * and a "Show N more" toggle. Images, videos, audio, and generic files each
 * get their own presentation. A single file belongs to `sk-media`.
 *
 * Reads the files to render from, in order of precedence:
 *
 * 1. the `attachments` property (a file array the host already holds — no
 *    request; this is how `sk-replies-list` renders replies' attachments),
 * 2. the `files` attribute: drive file ids, comma/whitespace separated, each
 *    resolved through `GET /drive/files/{id}/info` (one request per id).
 *
 * Reads are public and run unauthenticated. Deliberately UNSTYLED; opt into
 * the preset via `configure({ css })` or the `css` attribute (see
 * `sk-replies-list`).
 *
 * Attributes:
 * - `files`: drive file ids — `files="01M48SN…"` or
 *   `files="01M48SN…, 01M49QX…"`
 * - `max-visible`: items shown before the "Show N more" toggle (default 6)
 * - `flush`: full-bleed single-file presentation — breaks out of the container
 *   and letterboxes over a blurred copy of the image (default off)
 * - `fit`: `cover` (default) or `contain` for images/videos
 * - `css`, `base-url`: as on the other elements
 *
 * Properties:
 * - `attachments`: `SnFileAttachment[]` — render these files directly and skip
 *   every request (set from JavaScript: `el.attachments = post.attachments`)
 *
 * Events (dispatched on the host element; bubbles and composed):
 * - `media-click` with `detail = { index, file, url }`. Cancelable:
 *   `preventDefault()` suppresses the default action, which is opening the file
 *   in a new tab.
 *
 * Slots (light-DOM children, projected into the shadow root):
 * - `loading` — replaces the "Loading attachments..." status
 * - `error` — replaces the error message (also mirrored on the host as
 *   `data-error`)
 * - `empty` — replaces the "No attachments." state
 *
 * Styling: the `presets/media.css` preset (`--sk-*` custom properties, shared
 * with `sk-media` — both mark their host `sk-media`) plus a `part` on every
 * internal node: `media`, `single`, `backdrop`, `item`, `image`, `video`,
 * `play`, `audio`, `file`, `icon`, `name`, `counter`, `scroll`, `arrow-prev`,
 * `arrow-next`, `more`, `state`, `error`, `empty`.
 *
 *   sk-media-collection::part(item) { border-radius: 12px; }
 */

const props = withDefaults(
  defineProps<{
    /** Drive file ids, comma/whitespace separated. */
    files?: string;
    /** Host-supplied files; JavaScript-only (arrays have no attribute form). */
    attachments?: SnFileAttachment[] | null;
    maxVisible?: number;
    /** Attribute arrives as a string (`flush="false"`); `flagAttr` reads it. */
    flush?: boolean | string;
    fit?: string;
    css?: string;
    baseUrl?: string;
  }>(),
  { attachments: null, maxVisible: 6, flush: false, fit: "cover" },
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
const drive = new DriveApi(client);

// Stylesheets re-sync when `configure(...)` is called after mount.
const configVersion = ref(0);
const stopConfigSync = onConfigChange(() => {
  configVersion.value++;
});
onUnmounted(stopConfigSync);

onMounted(() => {
  markHost(rootEl.value, "sk-media");
});

const stylesheets = computed<string[]>(() => {
  void configVersion.value;
  if (props.css !== undefined) return props.css ? [props.css] : [];
  return toStylesheetList(getConfig().css);
});

/**
 * Custom-element attributes arrive as strings: bare `flush` and `flush=""`
 * mean "on", while `flush="false"` means off (see `utils/attrs`).
 */
const flushLayout = computed(() => flagAttr(props.flush, false));
const fitMode = computed(() => (props.fit === "contain" ? "contain" : "cover"));

const fetched = ref<FileLike[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

/** Host-supplied files win over the resolved ids. */
const files = computed<FileLike[]>(() => props.attachments ?? fetched.value);

/** Drive file ids from the `files` attribute (`"a"`, `"a, b"`, `"a b"`). */
const fileIds = computed(() =>
  (props.files ?? "").split(/[\s,]+/).filter(Boolean),
);

async function load(): Promise<void> {
  if (props.attachments) return;
  const ids = fileIds.value;
  if (ids.length === 0) {
    fetched.value = [];
    error.value = "Missing required `files` attribute.";
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    fetched.value = await Promise.all(ids.map((id) => drive.fetchFileInfo(id)));
  } catch (err) {
    fetched.value = [];
    error.value = err instanceof Error ? err.message : "Failed to load the files.";
  } finally {
    loading.value = false;
  }
}

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
  () => [props.files, props.attachments],
  () => void load(),
  { immediate: true },
);

/**
 * Re-dispatch grid clicks on the host (`media-click`, cancelable) and, unless
 * the host cancels it, open the file in a new tab — an embedded widget has no
 * viewer of its own, so the file is the useful default action.
 */
function onMediaClick(payload: {
  index: number;
  file: FileLike;
  url: string;
}): void {
  const event = new CustomEvent("media-click", {
    detail: payload,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  const proceed = rootEl.value?.dispatchEvent(event) ?? true;
  if (proceed && payload.url) {
    window.open(payload.url, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <section ref="rootEl" class="sk-media" :aria-busy="loading">
    <link
      v-for="href in stylesheets"
      :key="href"
      rel="stylesheet"
      :href="href"
    />

    <MediaGrid
      v-if="files.length > 0"
      :attachments="files"
      :max-visible="maxVisible"
      :flush="flushLayout"
      :fit="fitMode"
      :base-url="client.baseUrl"
      @media-click="onMediaClick"
    />

    <div v-if="loading" class="sk-state" part="state" role="status">
      <slot name="loading">Loading attachments...</slot>
    </div>
    <div
      v-else-if="error"
      class="sk-state sk-state--error"
      part="error"
      role="alert"
    >
      <slot name="error">{{ error }}</slot>
    </div>
    <div v-else-if="files.length === 0" class="sk-state" part="empty">
      <slot name="empty">No attachments.</slot>
    </div>
  </section>
</template>
