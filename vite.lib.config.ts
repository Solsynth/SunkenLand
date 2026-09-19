import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

/**
 * Library build for the embeddable `sk-*` custom elements.
 *
 * Produces:
 * - `dist/sunken-land.js`       — ESM bundle (npm `import`)
 * - `dist/sunken-land.iife.js`  — IIFE bundle (CDN `<script>`)
 *
 * Vue is bundled in: embedded components must work on hosts that know nothing
 * about Vue. The preset stylesheet is copied into `dist/presets/` by the
 * `build:lib` script.
 */
export default defineConfig({
  plugins: [vue()],
  // Library builds skip Vite's env replacement: pin NODE_ENV so bundled deps
  // (Vue et al.) take their production path instead of referencing `process`.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Library builds should not ship the app's public/ assets (favicon etc.).
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/elements/index.ts", import.meta.url)),
      name: "SunkenLand",
      formats: ["es", "iife"],
      fileName: (format) =>
        format === "es" ? "sunken-land.js" : "sunken-land.iife.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
