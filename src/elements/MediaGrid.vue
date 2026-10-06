<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { getAspectRatio, getFileKind, getFileUrl, type FileLike } from "../utils/files";
import MediaItem from "./MediaItem.vue";

/**
 * A post's attachments — the port of FloatLand's `AttachmentGrid.vue` +
 * `AttachmentItem.vue`: one attachment fills a box at the file's aspect ratio
 * (with a blurred backdrop copy in `flush` presentation); several become a
 * snapping horizontal list with a `n/total` counter, scroll arrows, and a
 * "show more" toggle.
 *
 * Shared by `sk-media` (one file) and `sk-media-collection` / `sk-replies-list`
 * (lists), so a reply's attachments render exactly like a post's.
 *
 * Deliberately UNSTYLED: `part`s (`media`, `single`, `backdrop`, `item`,
 * `image`, `video`, `play`, `audio`, `file`, `icon`, `name`, `counter`,
 * `scroll`, `arrow-prev`, `arrow-next`, `more`) plus class hooks, styled by
 * `presets/media.css`.
 *
 * Media never triggers the surrounding card: clicks stop propagating and are
 * emitted as `media-click` instead, so a reply row's own click handler does
 * not fire when its image is clicked.
 */
const props = withDefaults(
  defineProps<{
    attachments: FileLike[];
    /** Items shown before the "show more" toggle. */
    maxVisible?: number;
    /** Full-bleed presentation: a single attachment breaks out and letterboxes
     * over its own blurred backdrop copy. */
    flush?: boolean;
    /** Image/video fit inside the box (`contain` letterboxes + centers). */
    fit?: "cover" | "contain";
    /** API origin for drive file URLs. */
    baseUrl?: string;
  }>(),
  { maxVisible: 6, flush: false, fit: "cover" },
);

const emit = defineEmits<{
  "media-click": [payload: { index: number; file: FileLike; url: string }];
}>();

const showAll = ref(false);
const scroller = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

/** Absolute display URL per attachment (`url`, else the drive file id). */
const sources = computed<string[]>(() =>
  props.attachments.map(
    (file) => file.url || getFileUrl(file.id, { baseUrl: props.baseUrl }) || "",
  ),
);

const visible = computed(() =>
  showAll.value ? props.attachments : props.attachments.slice(0, props.maxVisible),
);
const single = computed(() => props.attachments[0]);
const collapsible = computed(() => props.attachments.length > props.maxVisible);

/**
 * Box for a single attachment. `flush` matches the Solian app's full-bleed
 * presentation: ratio clamped to [0.1, 10], landscape capped at 300px and
 * portrait at 380px. `width` must be explicit — `aspect-ratio` + `max-height`
 * alone leave the box at its natural size.
 */
const singleStyle = computed(() => {
  const file = single.value;
  if (!file) return { width: "100%" };
  const raw = getAspectRatio(file);
  if (!props.flush) {
    return {
      width: "100%",
      aspectRatio: String(raw),
      maxHeight: "500px",
    };
  }
  const ratio = Math.min(Math.max(raw, 0.1), 10);
  return {
    width: "100%",
    aspectRatio: String(ratio),
    maxHeight: `${ratio > 1 ? 300 : 380}px`,
  };
});

/** Fixed-size tile in the horizontal list: images keep a 240px height. */
function itemStyle(file: FileLike): Record<string, string> {
  const kind = getFileKind(file);
  if (kind === "audio") return { width: "280px", height: "120px" };
  if (kind !== "image") return { width: "280px", height: "180px" };
  const width = Math.round(240 * getAspectRatio(file));
  return { width: `${Math.min(width, 400)}px`, height: "240px" };
}

function updateScroll(): void {
  const el = scroller.value;
  if (!el) return;
  canScrollLeft.value = el.scrollLeft > 10;
  canScrollRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 10;
}

function scrollBy(direction: number): void {
  const el = scroller.value;
  if (!el) return;
  el.scrollBy({ left: el.clientWidth * 0.75 * direction, behavior: "smooth" });
}

function openAt(index: number): void {
  const file = visible.value[index];
  if (!file) return;
  emit("media-click", { index, file, url: sources.value[index] ?? "" });
}

function toggleAll(): void {
  showAll.value = !showAll.value;
  void nextTick(updateScroll);
}

watch(
  () => [props.attachments, props.maxVisible],
  () => void nextTick(updateScroll),
);

onMounted(() => {
  void nextTick(updateScroll);
  window.addEventListener("resize", updateScroll);
});
onUnmounted(() => window.removeEventListener("resize", updateScroll));
</script>

<template>
  <div
    v-if="attachments.length > 0"
    class="sk-media-grid"
    part="media"
    :data-count="attachments.length"
    :data-flush="flush ? 'true' : null"
  >
    <!-- Single attachment: one box at the file's aspect ratio. -->
    <div
      v-if="attachments.length === 1 && single"
      class="sk-media__single"
      part="single"
      :style="singleStyle"
      @click.stop="openAt(0)"
    >
      <!-- Full-bleed: a blurred cover copy fills the letterbox bands. -->
      <div
        v-if="flush && getFileKind(single) === 'image'"
        class="sk-media__backdrop"
        part="backdrop"
        aria-hidden="true"
      >
        <MediaItem :file="single" :base-url="baseUrl" fit="cover" decorative />
      </div>
      <div class="sk-media__layer">
        <MediaItem :file="single" :base-url="baseUrl" :fit="fit" />
      </div>
    </div>

    <!-- Multiple: horizontal snapping list + counter + arrows. -->
    <div v-else class="sk-media__strip">
      <div ref="scroller" class="sk-media__scroll" part="scroll" @scroll="updateScroll">
        <div
          v-for="(file, index) in visible"
          :key="file.id"
          class="sk-media__item"
          part="item"
          :style="itemStyle(file)"
          @click.stop="openAt(index)"
        >
          <MediaItem :file="file" :base-url="baseUrl" :fit="fit" />
          <span
            v-if="getFileKind(file) === 'image'"
            class="sk-media__counter"
            part="counter"
          >
            {{ index + 1 }}/{{ attachments.length }}
          </span>
        </div>
      </div>
      <button
        v-if="canScrollLeft"
        class="sk-media__arrow sk-media__arrow--prev"
        part="arrow-prev"
        type="button"
        aria-label="Scroll attachments back"
        @click.stop="scrollBy(-1)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <button
        v-if="canScrollRight"
        class="sk-media__arrow sk-media__arrow--next"
        part="arrow-next"
        type="button"
        aria-label="Scroll attachments forward"
        @click.stop="scrollBy(1)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>

    <button
      v-if="collapsible"
      class="sk-media__more"
      part="more"
      type="button"
      @click.stop="toggleAll"
    >
      {{
        showAll
          ? "Show less"
          : `Show ${attachments.length - maxVisible} more`
      }}
    </button>
  </div>
</template>
