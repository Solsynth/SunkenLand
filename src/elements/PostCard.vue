<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  ApiClient,
  API_BASE_URL,
  PostsApi,
  type SnPost,
  type SnPublisher,
} from "../api";
import { getConfig, onConfigChange, toStylesheetList } from "../config";
import { getSession } from "../session";
import {
  formatCount,
  formatRelativeTime,
  getAvatarUrl,
  getDisplayName,
  getInitials,
} from "../utils/format";
import { getFileUrl, type FileLike } from "../utils/files";
import { flagAttr } from "../utils/attrs";
import { getHostElement, markHost } from "../utils/host";
import { renderMarkdown } from "../utils/markdown";
import {
  buildReactionChips,
  normalizeReactionSymbols,
  reactionStickerSrc,
} from "../utils/reactions";
import {
  getUsernameTier,
  hasActiveMembership,
  membershipColor,
  membershipLabel,
  USERNAME_MEMBERSHIP_MARK,
  usernameColorStyle,
  verificationColor,
  verificationLabel,
  verificationMark,
  type UsernameColorSource,
} from "../utils/username";
import AvatarImage from "./AvatarImage.vue";
import MediaGrid from "./MediaGrid.vue";

/**
 * A whole post — the embeddable port of FloatLand's `PostCard.vue`: author
 * header (avatar, colourful name, handle, time), the replied/forwarded
 * reference, title/description, the Markdown body, attachments through the
 * shared media grid, tags, metadata (edited, visibility, views), a reaction
 * summary, and the stats footer.
 *
 * The post comes from `GET /sphere/posts/{post}` (a public read; a token, when
 * the page has one, adds `reactionsMade` so the visitor's own reactions are
 * highlighted). A host that already holds the post object passes it as the
 * `post` property and skips the request.
 *
 * The body renders through the package's dependency-free Markdown renderer
 * (`utils/markdown`), which escapes HTML and restricts link targets to
 * http(s)/mailto — the same posture as FloatLand's `html: false` markdown-it.
 * `isTruncated` posts keep the API's truncation marker.
 *
 * Actions that belong to the app rather than to an embed are deliberately out
 * of scope: the overflow menu (edit/delete/report/share), boosting, and
 * opening the composer. Pair the element with `sk-reaction-list` (interactive
 * reactions), `sk-reply-composer` and `sk-replies-list` for those, or build
 * them on the `post-click` event.
 *
 * Attributes:
 * - `post` (required): post id — `post="01a11173-…"`
 * - `detail`: full-post presentation — no truncation of the body, views shown,
 *   all tags
 * - `variant`: `card` (default) or `feed` (surface only; the preset styles it)
 * - `reference`: show the replied/forwarded preview (default on;
 *   `reference="false"` hides it)
 * - `media`: render attachments (default on; `media="false"` hides them)
 * - `reactions`: `summary` (default) or `off`
 * - `max-tags`: tags shown before the "+N" chip (default 3)
 * - `max-chips`: reaction chips shown before the "+N" chip (default 5)
 * - `sticker-url`: reaction sticker template with `{symbol}` substituted
 *   (defaults to `configure({ stickerUrl })`; without one, reactions are emoji,
 *   and `sticker-url=""` turns stickers off for this element)
 * - `url`: where the post points — opened on click unless canceled
 * - `publisher-url`: author link template (`{name}`, `{id}`)
 * - `tag-url`: tag link template (`{slug}`, `{id}`)
 * - `css`, `base-url`: as on the other elements
 *
 * Properties:
 * - `post`: `string | SnPost` — a post id (fetched) or the post object itself
 *   (`el.post = post`), which renders without any request
 *
 * Events (dispatched on the host element; bubble and are composed):
 * - `post-click` with `detail = { postId, post, target, href }`, where `target`
 *   is `"post"`, `"publisher"`, or `"tag"`. Cancelable: `preventDefault()`
 *   suppresses the default action, which is opening `href` in a new tab
 *   (nothing when the matching URL template is not set).
 * - `media-click` with `detail = { postId, post, index, file, url }` — the same
 *   event `sk-media`/`sk-media-collection` dispatch, re-dispatched on the post.
 *
 * Slots (light-DOM children, projected into the shadow root):
 * - `content` — replaces the rendered Markdown body (the slot receives `post`)
 * - `reference` — replaces the replied/forwarded preview
 * - `actions` — extra controls in the footer
 * - `loading`, `error` — as on the other elements
 *
 * Styling: the `presets/post.css` preset (`--sk-*` custom properties) plus a
 * `part` on every internal node: `header`, `avatar`, `publisher`,
 * `handle`, `time`, `reference`, `reference-toggle`, `reference-body`,
 * `title`, `description`, `body`, `content`, `media`, `tags`, `tag`,
 * `meta`, `edited`, `visibility`, `views`, `reactions`, `reaction-chip`,
 * `reaction-count`, `stats`, `replies`, `reaction-total`,
 * `footer`, `state`, `error`.
 *
 *   sk-post::part(content) { font-size: 0.95rem; }
 */

/** Visibility codes FloatLand renders a chip for (0 = public: no chip). */
const VISIBILITY_LABELS: Record<number, string> = {
  1: "Friends",
  2: "Unlisted",
  3: "Private",
};

/** Attachment file object in the post payload. */
type PostFile = FileLike;

const props = withDefaults(
  defineProps<{
    /** Post id (fetched) or the post object itself (JavaScript-only). */
    post?: string | SnPost | null;
    /**
     * Boolean attributes arrive as strings (`detail="false"`), so these accept
     * both — `utils/attrs.flagAttr` reads them.
     */
    detail?: boolean | string;
    variant?: string;
    reference?: boolean | string;
    media?: boolean | string;
    reactions?: string;
    maxTags?: number;
    maxChips?: number;
    stickerUrl?: string;
    url?: string;
    publisherUrl?: string;
    tagUrl?: string;
    css?: string;
    baseUrl?: string;
  }>(),
  {
    post: null,
    detail: false,
    variant: "card",
    reference: true,
    media: true,
    reactions: "summary",
    maxTags: 3,
    maxChips: 5,
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
const posts = new PostsApi(client);

// Stylesheets re-sync when `configure(...)` is called after mount.
const configVersion = ref(0);
const stopConfigSync = onConfigChange(() => {
  configVersion.value++;
});
onUnmounted(stopConfigSync);

onMounted(() => {
  markHost(rootEl.value, "sk-post");
});

const stylesheets = computed<string[]>(() => {
  void configVersion.value;
  if (props.css !== undefined) return props.css ? [props.css] : [];
  return toStylesheetList(getConfig().css);
});

/**
 * Custom-element attributes arrive as strings: bare `detail` and `detail=""`
 * mean "on", while `detail="false"` means off — see `utils/attrs`.
 */
const isDetail = computed(() => flagAttr(props.detail, false));
const showReference = computed(() => flagAttr(props.reference, true));
const showMedia = computed(() => flagAttr(props.media, true));
const showReactions = computed(() => props.reactions !== "off");
const showAllTags = computed(() => isDetail.value);

/** Per-element `sticker-url`, else the configured template ("" disables). */
const stickerTemplate = computed(() => {
  void configVersion.value;
  return props.stickerUrl !== undefined ? props.stickerUrl : getConfig().stickerUrl;
});

const fetched = ref<SnPost | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

/** The post to render: the host-supplied object wins over the fetched one. */
const data = computed<SnPost | null>(() =>
  props.post && typeof props.post !== "string" ? props.post : fetched.value,
);

const postId = computed(() =>
  typeof props.post === "string" ? props.post.trim() : (data.value?.id ?? ""),
);

async function load(): Promise<void> {
  const id = typeof props.post === "string" ? props.post.trim() : "";
  if (!id) {
    fetched.value = null;
    loading.value = false;
    error.value = props.post ? null : "Missing required `post` attribute.";
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    fetched.value = await posts.fetchPost(id);
  } catch (err) {
    fetched.value = null;
    error.value = err instanceof Error ? err.message : "Failed to load the post.";
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

watch(() => [props.post], () => void load(), { immediate: true });

// ── Author ──────────────────────────────────────────────────────────────────

const publisher = computed<SnPublisher | null>(() => data.value?.publisher ?? null);
const displayName = computed(() => getDisplayName(publisher.value));
const initials = computed(() => getInitials(displayName.value));
const avatarUrl = computed(() =>
  publisher.value ? getAvatarUrl(publisher.value, client.baseUrl) : undefined,
);

/**
 * The name's colour: the same Stellar-gated rules `sk-username` applies, read
 * from the publisher (whose embedded account carries the profile colour).
 */
const nameSource = computed<UsernameColorSource | null>(
  () => publisher.value?.account ?? publisher.value,
);
const nameStyle = computed(() => usernameColorStyle(nameSource.value));

/** The publisher-level verification mark, when the API sent one. */
const verification = computed(() => publisher.value?.verification ?? null);
const verificationMarkup = computed(() =>
  verificationMark(verification.value?.type ?? 0),
);
const verificationMarkColor = computed(() =>
  verificationColor(verification.value?.type ?? 0),
);
const verificationText = computed(() => verificationLabel(verification.value));

const membership = computed(() => hasActiveMembership(nameSource.value));
const membershipMarkColor = computed(() =>
  membershipColor(getUsernameTier(nameSource.value)),
);
const membershipText = computed(() =>
  membershipLabel(getUsernameTier(nameSource.value)),
);

// ── Body ────────────────────────────────────────────────────────────────────

const isArticle = computed(() => data.value?.type === 1);
const title = computed(() => data.value?.title ?? "");
const description = computed(() => data.value?.description ?? "");

/**
 * The Markdown body, with the API's truncation marker preserved. Articles keep
 * their body for the detail presentation only — in a list they are a summary
 * card, like FloatLand.
 */
const renderedContent = computed(() => {
  const post = data.value;
  if (!post?.content) return "";
  const source = post.isTruncated ? `${post.content}...` : post.content;
  return renderMarkdown(source);
});

const showBody = computed(
  () => !isArticle.value || isDetail.value,
);

/** Article cards show the `meta.thumbnail` attachment instead of the grid. */
const articleThumbnail = computed<PostFile | null>(() => {
  if (!isArticle.value || isDetail.value) return null;
  const post = data.value;
  if (!post) return null;
  const meta = (post.meta ?? post.metadata ?? {}) as Record<string, unknown>;
  const id = typeof meta.thumbnail === "string" ? meta.thumbnail : null;
  if (!id) return post.attachments[0] ?? null;
  return post.attachments.find((file) => file.id === id) ?? null;
});
const articleThumbnailUrl = computed(() => {
  const file = articleThumbnail.value;
  return file ? file.url || getFileUrl(file.id, { baseUrl: client.baseUrl }) : undefined;
});

// ── Reference (replied / forwarded) ─────────────────────────────────────────

const referencePost = computed<SnPost | null>(
  () => data.value?.repliedPost ?? data.value?.forwardedPost ?? null,
);
const referenceKind = computed(() =>
  data.value?.forwardedPost ? "forwarded" : "replied",
);
const referenceOpen = ref(false);
const referenceName = computed(() => getDisplayName(referencePost.value?.publisher));
const referenceContent = computed(() => {
  const source = referencePost.value?.content ?? "";
  if (!source) return "";
  return renderMarkdown(referencePost.value?.isTruncated ? `${source}...` : source);
});

// ── Tags ────────────────────────────────────────────────────────────────────

const tags = computed(() => data.value?.tags ?? []);
const visibleTags = computed(() =>
  showAllTags.value ? tags.value : tags.value.slice(0, props.maxTags),
);
const hiddenTagCount = computed(() => Math.max(0, tags.value.length - visibleTags.value.length));

// ── Reactions ───────────────────────────────────────────────────────────────

const chips = computed(() => {
  const post = data.value;
  if (!post) return [];
  return buildReactionChips(
    normalizeReactionSymbols(post.reactionsCount ?? {}),
    post.reactionsMade ? normalizeReactionSymbols(post.reactionsMade) : null,
  );
});
const visibleChips = computed(() => chips.value.slice(0, props.maxChips));
const hiddenChipCount = computed(() =>
  Math.max(0, chips.value.length - visibleChips.value.length),
);
const reactionTotal = computed(() =>
  chips.value.reduce((total, chip) => total + chip.count, 0),
);

function chipSticker(symbol: string): string | undefined {
  return reactionStickerSrc(stickerTemplate.value, symbol);
}

// ── Meta / stats ────────────────────────────────────────────────────────────

const publishedTime = computed(() => {
  const published = data.value?.publishedAt;
  return published ? formatRelativeTime(published) : "";
});
const editedTime = computed(() => {
  const edited = data.value?.editedAt;
  return edited ? formatRelativeTime(edited) : "";
});
const visibilityLabel = computed(
  () => VISIBILITY_LABELS[data.value?.visibility ?? 0] ?? "",
);

// ── Interaction ─────────────────────────────────────────────────────────────

/** Expand `{name}`/`{id}`-style templates into a link target. */
function expandTemplate(
  template: string | undefined,
  values: Record<string, string | undefined>,
): string | undefined {
  if (!template) return undefined;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * Re-dispatch a click on the host (`post-click`, cancelable) and, unless the
 * host cancels it, open the target — an embedded post has no router of its own,
 * so the host supplies the URL templates (nothing opens without them).
 */
function onClick(target: "post" | "publisher" | "tag", tagSlug?: string): void {
  const post = data.value;
  const href =
    target === "publisher"
      ? expandTemplate(props.publisherUrl, {
          name: publisher.value?.name,
          id: publisher.value?.id,
        })
      : target === "tag"
        ? expandTemplate(props.tagUrl, {
            slug: tagSlug,
            name: tagSlug,
          })
        : expandTemplate(props.url, { id: post?.id, name: publisher.value?.name });

  const event = new CustomEvent("post-click", {
    detail: { postId: post?.id ?? postId.value, post, target, href: href ?? null },
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  const proceed = rootEl.value?.dispatchEvent(event) ?? true;
  if (proceed && href) window.open(href, "_blank", "noopener,noreferrer");
}

/** Attachment clicks bubble as `media-click`, tagged with the post. */
function onMediaClick(payload: { index: number; file: PostFile; url: string }): void {
  const post = data.value;
  rootEl.value?.dispatchEvent(
    new CustomEvent("media-click", {
      detail: { postId: post?.id ?? postId.value, post, ...payload },
      bubbles: true,
      composed: true,
    }),
  );
}
</script>

<template>
  <article
    ref="rootEl"
    class="sk-post"
    :data-variant="props.variant"
    :data-detail="isDetail ? '' : undefined"
    :aria-busy="loading"
  >
    <link
      v-for="href in stylesheets"
      :key="href"
      rel="stylesheet"
      :href="href"
    />

    <template v-if="data">
      <header class="sk-post__header" part="header">
        <span class="sk-post__avatar" part="avatar" @click="onClick('publisher')">
          <AvatarImage
            v-if="avatarUrl"
            :publisher="publisher"
            :base-url="client.baseUrl"
          />
          <span v-else class="sk-post__initials">{{ initials }}</span>
        </span>

        <span class="sk-post__who">
          <span class="sk-post__line">
            <span
              class="sk-post__publisher"
              part="publisher"
              :style="nameStyle"
              @click="onClick('publisher')"
            >{{ displayName }}</span>
            <svg
              v-if="verification"
              class="sk-post__mark sk-post__mark--verification"
              part="verification"
              viewBox="0 0 24 24"
              :style="{ color: verificationMarkColor }"
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
                v-html="verificationMarkup"
              />
            </svg>
            <svg
              v-if="membership"
              class="sk-post__mark sk-post__mark--membership"
              part="membership"
              viewBox="0 0 24 24"
              :style="{ color: membershipMarkColor }"
              role="img"
              aria-hidden="false"
            >
              <title>{{ membershipText }}</title>
              <g
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                v-html="USERNAME_MEMBERSHIP_MARK"
              />
            </svg>
          </span>
          <span class="sk-post__sub" part="handle">
            <span class="sk-post__handle">@{{ publisher?.name }}</span>
            <span v-if="publishedTime" class="sk-post__time" part="time">· {{ publishedTime }}</span>
          </span>
        </span>
      </header>

      <section
        v-if="showReference && referencePost"
        class="sk-post__reference"
        part="reference"
      >
        <slot name="reference" :post="referencePost">
          <button
            type="button"
            class="sk-post__reference-toggle"
            part="reference-toggle"
            :aria-expanded="referenceOpen"
            @click="referenceOpen = !referenceOpen"
          >{{ referenceKind === "forwarded" ? "Forwarded" : "Replied to" }}</button>
          <div v-if="referenceOpen" class="sk-post__reference-body" part="reference-body">
            <span
              class="sk-post__reference-publisher"
              part="reference-publisher"
            >{{ referenceName }}</span>
            <div
              v-if="referenceContent"
              class="sk-post__reference-content"
              part="reference-content"
              v-html="referenceContent"
            />
            <span
              v-if="(referencePost?.attachments?.length ?? 0) > 0"
              class="sk-post__reference-attachments"
              part="reference-attachments"
            >{{ formatCount(referencePost?.attachments?.length ?? 0) }} attachment(s)</span>
          </div>
        </slot>
      </section>

      <h3
        v-if="title"
        class="sk-post__title"
        part="title"
        @click="onClick('post')"
      >{{ title }}</h3>
      <p v-if="description" class="sk-post__description" part="description">{{ description }}</p>

      <div v-if="showBody" class="sk-post__body" part="body">
        <div v-if="$slots.content" class="sk-post__content" part="content">
          <slot name="content" :post="data" />
        </div>
        <div
          v-else-if="renderedContent"
          class="sk-post__content"
          part="content"
          v-html="renderedContent"
        />
      </div>

      <div v-if="showMedia && articleThumbnailUrl" class="sk-post__thumb" part="thumbnail">
        <img
          :src="articleThumbnailUrl"
          :alt="title || displayName"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div v-else-if="showMedia && (data.attachments?.length ?? 0) > 0" class="sk-post__media" part="media">
        <MediaGrid
          :attachments="data.attachments"
          :base-url="client.baseUrl"
          @media-click="onMediaClick"
        />
      </div>

      <div v-if="tags.length > 0" class="sk-post__tags" part="tags">
        <span
          v-for="tag in visibleTags"
          :key="tag.id"
          class="sk-post__tag"
          part="tag"
          @click="onClick('tag', tag.slug)"
        >{{ tag.name ?? `#${tag.slug}` }}</span>
        <span v-if="hiddenTagCount > 0" class="sk-post__tag sk-post__tag--more" part="tag-more">+{{ hiddenTagCount }}</span>
      </div>

      <div class="sk-post__meta" part="meta">
        <span v-if="editedTime" class="sk-post__edited" part="edited">Edited · {{ editedTime }}</span>
        <span v-if="visibilityLabel" class="sk-post__visibility" part="visibility">
          {{ visibilityLabel }}
        </span>
        <span v-if="isDetail" class="sk-post__views" part="views">Views · {{ formatCount(data.viewsTotal) }}</span>
      </div>

      <div v-if="showReactions && chips.length > 0" class="sk-post__reactions" part="reactions">
        <span
          v-for="chip in visibleChips"
          :key="chip.symbol"
          class="sk-post__reaction-chip"
          part="reaction-chip"
          :data-symbol="chip.symbol"
          :data-reacted="chip.reacted ? 'true' : undefined"
          :title="chip.label"
        >
          <img
            v-if="chipSticker(chip.symbol)"
            class="sk-post__sticker"
            :src="chipSticker(chip.symbol)"
            :alt="chip.label"
            loading="lazy"
            decoding="async"
          />
          <span v-else class="sk-post__emoji">{{ chip.emoji }}</span>
          <span class="sk-post__reaction-count" part="reaction-count">{{ formatCount(chip.count) }}</span>
        </span>
        <span v-if="hiddenChipCount > 0" class="sk-post__reaction-chip sk-post__reaction-chip--more" part="reaction-more">+{{ hiddenChipCount }}</span>
      </div>

      <footer class="sk-post__footer" part="footer">
        <div class="sk-post__stats" part="stats">
          <span class="sk-post__stat sk-post__stat--replies" part="replies">
            Replies · {{ formatCount(data.repliesCount) }}
          </span>
          <span class="sk-post__stat sk-post__stat--reactions" part="reaction-total">
            Reactions · {{ formatCount(reactionTotal) }}
          </span>
        </div>
        <div class="sk-post__actions" part="actions">
          <slot name="actions" :post="data" />
        </div>
        <button
          v-if="props.url"
          type="button"
          class="sk-post__link"
          part="link"
          @click="onClick('post')"
        >Open post</button>
      </footer>
    </template>

    <div v-if="loading && !data" class="sk-state" part="state" role="status">
      <slot name="loading">Loading post...</slot>
    </div>
    <div
      v-if="error && !data"
      class="sk-state sk-state--error"
      part="error"
      role="alert"
    >
      <slot name="error">{{ error }}</slot>
    </div>
  </article>
</template>
