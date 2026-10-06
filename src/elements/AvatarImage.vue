<script setup lang="ts">
import { UnLazyImage } from "@unlazy/vue/components";
import { computed } from "vue";
import {
  getAvatarFile,
  getAvatarUrl,
  getDisplayName,
  type PublisherLike,
} from "../utils/format";
import { getBlurhash, getImageSize } from "../utils/files";

/**
 * Publisher/account avatar, loaded through unlazy: the drive-file URL resolves
 * from the picture id (`url` is `null` on the wire), the blurhash becomes the
 * placeholder, and the intrinsic size keeps the placeholder's aspect ratio.
 *
 * Shared by `sk-replies-list` (a reply's author) and `sk-reply-composer` (the
 * selected publisher + the switcher list) so every avatar renders the same
 * way. Renders nothing when the publisher has no picture — callers fall back to
 * initials (`getInitials`).
 */
const props = defineProps<{
  publisher: PublisherLike | null | undefined;
  /** API origin for the drive file URL (`base-url`, else the configured one). */
  baseUrl?: string;
}>();

const file = computed(() => getAvatarFile(props.publisher));
const url = computed(() => getAvatarUrl(props.publisher, props.baseUrl));
const size = computed(() => getImageSize(file.value));
</script>

<template>
  <UnLazyImage
    v-if="url"
    :src="url"
    :alt="getDisplayName(publisher)"
    :blurhash="getBlurhash(file)"
    :width="size?.width"
    :height="size?.height"
  />
</template>
