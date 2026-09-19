import type { StorybookConfig } from "@storybook/web-components-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
  ],
  framework: "@storybook/web-components-vite",
  // Serve the preset stylesheets so elements can reference them via the
  // `css` attribute (e.g. css="/presets/replies-list.css"), exactly like a
  // consumer would from a CDN.
  staticDirs: [{ from: "../presets", to: "/presets" }],
  // The project's vite.config.ts is loaded automatically (configLoader:
  // native), which provides the vue() plugin and the "@" alias needed to
  // compile the Vue-SFC-backed elements imported from src/elements.
};

export default config;
