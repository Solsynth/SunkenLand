<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ApiClient, API_BASE_URL, DriveApi, type SnFileAttachment } from "../api";
import { getConfig, onConfigChange, toStylesheetList } from "../config";
import { getSession } from "../session";
import type { FileLike } from "../utils/files";
import { getHostElement, markHost } from "../utils/host";
import MediaGrid from "./MediaGrid.vue";

/**
 * ONE drive file — a post attachment, an avatar-sized picture, a markdown
 * `solian://files/{id}` target — rendered the way FloatLand's `AttachmentItem`
 * renders it: an image (through unlazy), a video with a play overlay, an
 * `<audio controls>`, or a file card. The box takes the file's aspect ratio
 * (capped at 500px tall) and `fit` decides `cover` (default) vs `contain`.
 *
 * A list of files belongs to `sk-media-collection`; passing several ids here
 * reports that instead of silently rendering the first one.
 *
 * The file's metadata (name, MIME type, dimensions, blurhash) comes from
 * `GET /drive/files/{id}/info` — a public read — so a bare file id needs no
 * post. A host that already holds the file object passes it as the
 * `attachment` property and skips the request.
 *
 * Reads are public and run unauthenticated. Deliberately UNSTYLED; opt into
 * the preset via `configure({ css })` or the `css` attribute (see
 * `sk-replies-list`).
 *
 * Attributes:
 * - `file`: drive file id (`file="01M48SNHMZQ34TXZKRMJQX7JG1"`)
 * - `fit`: `cover` (default) or `contain`
 * - `css`, `base-url`: as on the other elements
 *
 * Properties:
 * - `attachment`: `SnFileAttachment` — render this file directly, no request
 *   (set from JavaScript: `el.attachment = post.attachments[0]`)
 *
 * Events (dispatched on the host element; bubbles and composed):
 * - `media-click` with `detail = { file, url }`. Cancelable: `preventDefault()`
 *   suppresses the default action, which is opening the file in a new tab.
 *
 * Slots (light-DOM children, projected into the shadow root):
 * - `loading` — replaces the "Loading file..." status
 * - `error` — replaces the error message (also mirrored on the host as
 *   `data-error`)
 *
 * Styling: the `presets/media.css` preset (`--sk-*` custom properties, the
 * same file `sk-media-collection` uses — both mark their host `sk-media`) plus
 * a `part` on every internal node: `single`, `backdrop`, `image`, `video`,
 * `play`, `audio`, `file`, `icon`, `name`, `state`, `error`.
 *
 *   sk-media::part(video) { border-radius: 12px; }
 */

const props = withDefaults(
  defineProps<{
    /** Drive file id. */
    file?: string;
    /** One file object (JavaScript-only); skips the metadata request. */
    attachment?: SnFileAttachment | null;
    fit?: string;
    css?: string;
    baseUrl?: string;
  }>(),
  { attachment: null, fit: "cover" },
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

const fitMode = computed(() => (props.fit === "contain" ? "contain" : "cover"));

const fetched = ref<FileLike | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

/** The host-supplied attachment wins over the fetched file. */
const files = computed<FileLike[]>(() => {
  const file = props.attachment ?? fetched.value;
  return file ? [file] : [];
});

async function load(): Promise<void> {
  if (props.attachment) return;
  const id = (props.file ?? "").trim();
  if (!id) {
    fetched.value = null;
    error.value = "Missing required `file` attribute.";
    return;
  }
  if (/[\s,]/.test(id)) {
    fetched.value = null;
    error.value =
      "`sk-media` renders one file — use `sk-media-collection` for a list.";
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    fetched.value = await drive.fetchFileInfo(id);
  } catch (err) {
    fetched.value = null;
    error.value = err instanceof Error ? err.message : "Failed to load the file.";
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
  () => [props.file, props.attachment],
  () => void load(),
  { immediate: true },
);

/**
 * Re-dispatch the click on the host (`media-click`, cancelable) and, unless the
 * host cancels it, open the file in a new tab — an embedded widget has no
 * viewer of its own, so the file is the useful default action.
 */
function onMediaClick(payload: { file: FileLike; url: string }): void {
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
      :fit="fitMode"
      :base-url="client.baseUrl"
      @media-click="onMediaClick"
    />

    <div v-if="loading" class="sk-state" part="state" role="status">
      <slot name="loading">Loading file...</slot>
    </div>
    <div
      v-else-if="error"
      class="sk-state sk-state--error"
      part="error"
      role="alert"
    >
      <slot name="error">{{ error }}</slot>
    </div>
  </section>
</template>
