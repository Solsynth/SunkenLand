<script setup lang="ts">
import { UnLazyImage } from "@unlazy/vue/components";
import { computed } from "vue";
import {
  getBlurhash,
  getFileKind,
  getFileUrl,
  getImageSize,
  type FileLike,
} from "../utils/files";

/**
 * One attachment's media node: image, video, audio, or generic file.
 * Presentational — the surrounding grid owns the box size and the click.
 *
 * Images load through unlazy (`data-src` swapped in once preloaded, blurhash
 * as the placeholder), the same way FloatLand's `FileImage` does. Videos,
 * audio, and files are plain elements — a poster frame is not part of the
 * attachment payload.
 *
 * Deliberately UNSTYLED: every node carries a `part` (`image`, `video`,
 * `play`, `audio`, `file`, `icon`, `name`) plus `data-kind` / `data-fit`
 * hooks, and the look comes from `presets/media.css`. The URL resolves through
 * `getFileUrl` when the file has no direct `url` (the API sends `url: null`
 * and serves the bytes from `…/drive/files/{id}`).
 */
const props = withDefaults(
  defineProps<{
    file: FileLike;
    /** Image/video fit inside the box (`contain` letterboxes + centers). */
    fit?: "cover" | "contain";
    /** API origin for the drive file URL. */
    baseUrl?: string;
    /**
     * Decorative layer (the blurred backdrop copy of a full-bleed image): no
     * alt text, hidden from assistive tech, no `image` part so hosts styling
     * `::part(image)` never hit it.
     */
    decorative?: boolean;
  }>(),
  { fit: "cover", decorative: false },
);

const kind = computed(() => getFileKind(props.file));
const fileUrl = computed(
  () => props.file.url || getFileUrl(props.file.id, { baseUrl: props.baseUrl }) || "",
);
const size = computed(() => getImageSize(props.file));
</script>

<template>
  <UnLazyImage
    v-if="kind === 'image'"
    class="sk-media__img"
    :part="decorative ? undefined : 'image'"
    :src="fileUrl"
    :alt="decorative ? '' : (file.name ?? '')"
    :blurhash="getBlurhash(file)"
    :width="size?.width"
    :height="size?.height"
    :aria-hidden="decorative ? 'true' : undefined"
    :data-kind="kind"
    :data-fit="fit"
  />
  <div
    v-else-if="kind === 'video'"
    class="sk-media__video"
    part="video"
    :data-kind="kind"
    :data-fit="fit"
  >
    <video :src="fileUrl" preload="metadata" playsinline></video>
    <span class="sk-media__play" part="play" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
    <span class="sk-media__name" part="name">{{ file.name }}</span>
  </div>
  <div
    v-else-if="kind === 'audio'"
    class="sk-media__audio"
    part="audio"
    :data-kind="kind"
  >
    <audio :src="fileUrl" preload="metadata" controls></audio>
    <span class="sk-media__name" part="name">{{ file.name }}</span>
  </div>
  <div v-else class="sk-media__file" part="file" data-kind="file">
    <span class="sk-media__icon" part="icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
    </span>
    <span class="sk-media__name" part="name">{{ file.name }}</span>
  </div>
</template>
