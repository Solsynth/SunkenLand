<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  ApiClient,
  API_BASE_URL,
  PostsApi,
  type SnPost,
  type ThreadedReplyNode,
  type ReplyListFilters,
} from "../api";
import { getConfig, onConfigChange, toStylesheetList } from "../config";
import { onWindowEvent, REPLY_POSTED_EVENT } from "../events";
import { getSession } from "../session";
import { renderMarkdown } from "../utils/markdown";
import {
  formatRelativeTime,
  getAvatarUrl,
  getDisplayName,
  getInitials,
} from "../utils/format";
import { getHostElement, markHost } from "../utils/host";
import type { FileLike } from "../utils/files";
import AvatarImage from "./AvatarImage.vue";
import MediaGrid from "./MediaGrid.vue";

/**
 * Threaded reply list for a parent post.
 *
 * Deliberately UNSTYLED: this component renders semantic markup only. Opt into
 * the FloatLand-flavored look by configuring the preset stylesheet once —
 * `configure({ css: "https://cdn…/presets/replies-list.css" })` — or
 * per element via the `css` attribute (`css=""` disables it). Configured
 * stylesheets are injected into the element's shadow root as `<link>`s and
 * re-sync live when `configure` is called again.
 *
 * Attributes:
 * - `post` (required): parent post id
 * - `take`, `offset`: pagination
 * - `query-term`, `realm`, `media`, `order-desc`, `type`, `pub`: list filters
 *   forwarded to the replies endpoint query
 * - `header`: show the "N replies" header (default true)
 * - `view-all-url`: optional link to the full conversation
 * - `css`: per-element stylesheet URL override (overrides configured
 *   configured `css`; `css=""` disables styling for this element)
 * - `base-url`: per-element API origin override (defaults to `configure`d
 *   `baseUrl`, then `https://api.solian.app`)
 *
 * Reads are public and run unauthenticated. When a session is configured (the
 * package's `session` singleton by default, or `configure({ session })`), the
 * list attaches the session's access token to requests and re-fetches
 * automatically when a reply to `post` is posted elsewhere on the page
 * (`sunkenland:reply-posted`, dispatched by `sk-reply-composer`).
 *
 * Events (dispatched on the host element; they bubble and are composed so they
 * cross the shadow boundary):
 * - `reply-click` with `detail = { postId, post }`
 * - `media-click` with `detail = { postId, post, index, file, url }` when an
 *   attachment is clicked. Cancelable; nothing opens by default — the host
 *   decides (see `sk-media` for the same event with a default action).
 *
 * Slots (light-DOM children, projected into the shadow root — work from any
 * host, no Vue required):
 * - `header` — replaces the "N replies" header content
 * - `loading` — replaces the "Loading replies..." status
 * - `error` — replaces the error message (read the message via the `data-error`
 *   attribute on the host element)
 * - `empty` — replaces the "No replies yet." state
 * - `load-more` — replaces the load-more button label
 * - `view-all` — replaces the view-all link label
 * Each slot has a sensible fallback, so slots are strictly opt-in.
 *
 * Styling: the preset (see `presets/replies-list.css`) is driven by `--sk-*`
 * custom properties, and every internal node carries a `part` for direct
 * external styling: `header`, `count`, `list`, `reply`, `avatar`, `body`,
 * `meta`, `author`, `handle`, `time`, `content`, `attachments`, `stats`,
 * `state`, `error`, `empty`, `load-more`, `view-all`.
 *
 * A reply's attachments render through the shared media grid (the same markup
 * `sk-media-collection` uses), so its parts are available here too: `media`,
 * `single`, `backdrop`, `item`, `image`, `video`, `play`, `audio`, `file`,
 * `icon`, `name`, `counter`, `scroll`, `arrow-prev`, `arrow-next`, `more`.
 *
 *   sk-replies-list::part(reply) { border-left: 2px solid currentColor; }
 */

const props = withDefaults(
  defineProps<{
    post: string;
    take?: number;
    offset?: number;
    queryTerm?: string;
    realm?: string;
    media?: boolean;
    orderDesc?: boolean;
    type?: string;
    pub?: string;
    header?: boolean;
    viewAllUrl?: string;
    css?: string;
    baseUrl?: string;
  }>(),
  { take: 6, offset: 0, header: true },
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

onMounted(() => {
  markHost(rootEl.value, "sk-replies");
});

// Re-fetch when a reply is posted to this post (e.g. by an `sk-reply-composer`
// on the same page), so the list stays current without host wiring.
const stopReplyEvents = onWindowEvent(REPLY_POSTED_EVENT, (event) => {
  const detail = event.detail as { postId?: string } | undefined;
  if (detail?.postId === props.post) void load(true);
});
onUnmounted(stopReplyEvents);

const stylesheets = computed<string[]>(() => {
  // Re-evaluate whenever the config changes (the `css` attribute is already
  // reactive on its own).
  void configVersion.value;
  if (props.css !== undefined) return props.css ? [props.css] : [];
  return toStylesheetList(getConfig().css);
});

const nodes = ref<ThreadedReplyNode[]>([]);
const total = ref(0);
const nextOffset = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

const hasMore = computed(() => nextOffset.value < total.value);

const filters = computed<ReplyListFilters>(() => ({
  queryTerm: props.queryTerm || undefined,
  realm: props.realm || undefined,
  media: props.media ? true : undefined,
  orderDesc: props.orderDesc ? true : undefined,
  type: props.type || undefined,
  pub: props.pub || undefined,
}));

async function load(reset: boolean): Promise<void> {
  if (!props.post) {
    nodes.value = [];
    total.value = 0;
    error.value = "Missing required `post` attribute.";
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const from = reset ? props.offset : nextOffset.value;
    const result = await posts.fetchPostRepliesThreaded(props.post, {
      take: props.take,
      offset: from,
      filters: filters.value,
    });
    nodes.value = reset ? result.nodes : [...nodes.value, ...result.nodes];
    total.value = result.total;
    nextOffset.value = from + result.nodes.length;
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to load replies.";
  } finally {
    loading.value = false;
  }
}

function onReplyClick(post: SnPost): void {
  rootEl.value?.dispatchEvent(
    new CustomEvent("reply-click", {
      detail: { postId: post.id, post },
      bubbles: true,
      composed: true,
    }),
  );
}

/**
 * Re-dispatch an attachment click as `media-click` (cancelable) on the host,
 * with the reply's post attached. The list has no viewer of its own — like
 * `reply-click`, the host decides what happens next (and the click never
 * reaches the row, so `reply-click` does not also fire).
 */
function onMediaClick(
  post: SnPost,
  payload: { index: number; file: FileLike; url: string },
): void {
  rootEl.value?.dispatchEvent(
    new CustomEvent("media-click", {
      detail: { postId: post.id, post, ...payload },
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  );
}

// Mirror the error message onto the host element so hosts overriding the
// `error` slot can still read it (e.g. to render their own state). `flush:
// "post"` ensures the first (synchronous) error lands after the shadow tree
// is mounted, so `rootEl` exists when the attribute is written.
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
  () => [
    props.post,
    props.take,
    props.offset,
    props.queryTerm,
    props.realm,
    props.media,
    props.orderDesc,
    props.type,
    props.pub,
  ],
  () => load(true),
  { immediate: true },
);
</script>

<template>
  <section
    ref="rootEl"
    class="sk-replies"
    :aria-busy="loading"
    :aria-label="`Replies to post ${post}`"
  >
    <link
      v-for="href in stylesheets"
      :key="href"
      rel="stylesheet"
      :href="href"
    />
    <header v-if="header && total > 0" class="sk-replies__header" part="header">
      <slot name="header">
        <span class="sk-replies__count" part="count">
          {{ total }} {{ total === 1 ? "reply" : "replies" }}
        </span>
      </slot>
    </header>

    <ul v-if="nodes.length > 0" class="sk-replies__list" part="list">
      <li
        v-for="node in nodes"
        :key="node.post.id"
        class="sk-reply"
        part="reply"
        :style="{ '--sk-depth': node.depth }"
        :aria-level="node.depth + 1"
        @click="onReplyClick(node.post)"
      >
        <span
          v-if="getAvatarUrl(node.post.publisher, client.baseUrl)"
          class="sk-reply__avatar"
          part="avatar"
        >
          <AvatarImage :publisher="node.post.publisher" :base-url="client.baseUrl" />
        </span>
        <span
          v-else
          class="sk-reply__avatar sk-reply__avatar--placeholder"
          part="avatar"
          aria-hidden="true"
        >
          {{ getInitials(getDisplayName(node.post.publisher)) }}
        </span>

        <div class="sk-reply__body" part="body">
          <div class="sk-reply__meta" part="meta">
            <span class="sk-reply__author" part="author">
              {{ getDisplayName(node.post.publisher) }}
            </span>
            <span v-if="node.post.publisher?.name" class="sk-reply__handle" part="handle">
              @{{ node.post.publisher.name }}
            </span>
            <time class="sk-reply__time" part="time" :datetime="node.post.publishedAt">
              {{ formatRelativeTime(node.post.publishedAt) }}
            </time>
          </div>

          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            v-if="node.post.content"
            class="sk-reply__content"
            part="content"
            v-html="renderMarkdown(node.post.content)"
          />

          <div
            v-if="node.post.attachments.length > 0"
            class="sk-reply__attachments"
            part="attachments"
          >
            <MediaGrid
              :attachments="node.post.attachments"
              :base-url="client.baseUrl"
              @media-click="(payload) => onMediaClick(node.post, payload)"
            />
          </div>

          <div v-if="node.post.repliesCount > 0 || node.post.boostCount > 0" class="sk-reply__stats" part="stats">
            <span v-if="node.post.repliesCount > 0">
              {{ node.post.repliesCount }}
              {{ node.post.repliesCount === 1 ? "reply" : "replies" }}
            </span>
            <span v-if="node.post.boostCount > 0">
              {{ node.post.boostCount }}
              {{ node.post.boostCount === 1 ? "boost" : "boosts" }}
            </span>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="loading" class="sk-state" part="state" role="status">
      <slot name="loading">Loading replies...</slot>
    </div>
    <div
      v-else-if="error && nodes.length === 0"
      class="sk-state sk-state--error"
      part="error"
      role="alert"
    >
      <slot name="error">{{ error }}</slot>
    </div>
    <div v-else-if="!loading && total === 0" class="sk-state" part="empty">
      <slot name="empty">No replies yet.</slot>
    </div>

    <button
      v-if="hasMore && !loading"
      class="sk-load-more"
      part="load-more"
      type="button"
      @click="load(false)"
    >
      <slot name="load-more">Load more replies...</slot>
    </button>

    <a v-if="viewAllUrl && total > 3" class="sk-view-all" part="view-all" :href="viewAllUrl">
      <slot name="view-all">View all {{ total }} replies</slot>
    </a>
  </section>
</template>
