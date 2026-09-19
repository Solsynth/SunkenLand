<script setup lang="ts">
/**
 * The Solar Network brand mark — ported from Solian's
 * `assets/icons/icon-outline.svg` (used as the app-bar title there).
 *
 * Stroke-only and tinted with `currentColor`, mirroring how Solian renders it
 * (`SvgPicture.asset(..., color: …)`). Size/color come from the parent's CSS
 * (`--sk-btn-logo-size` / `--sk-btn-logo-color`), so the mark inherits theme
 * tokens instead of hardcoding them.
 */
</script>

<template>
  <svg
    viewBox="0 0 192 192"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path stroke-width="12" d="M54 147h86" />
    <path
      stroke-width="10"
      d="M57 111s-2-4.5-2-10m22 22s-4 7-11 4m9-22s-2-4.5-2-10"
    />
    <path
      stroke-width="12"
      d="M54 147a32 32 0 0 1-11.999-61.665A39 39 0 0 1 81 46m59 101a30 30 0 0 0 29.933-28"
    />
    <circle cx="132" cy="75" r="4" stroke-width="8" />
    <path
      stroke-width="10"
      d="M112.5 41.217C100.843 47.961 93 60.564 93 75c0 6.375 1.53 12.393 4.242 17.707m69.513-35.419A38.84 38.84 0 0 1 171 75c0 14.433-7.84 27.034-19.493 33.779m-.793-43.317A20.9 20.9 0 0 1 153 75c0 7.77-4.221 14.556-10.495 18.188m-21.003-36.38C115.224 60.44 111 67.226 111 75a20.9 20.9 0 0 0 2.284 9.533"
    />
  </svg>
</template>
