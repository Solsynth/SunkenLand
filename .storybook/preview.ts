import type { Preview } from "@storybook/web-components-vite";

import { configure } from "../src/config";
import { installApiStub } from "./fixtures";
import { defineRepliesList } from "../src/elements/replies-list";

// Elements fetch `https://api.solian.app` — stub it so stories run anywhere.
installApiStub();

// Preset stylesheet for every element, injected via the shared config (the
// same call a CDN host would make with `SunkenLand.configure(...)`).
configure({ stylesheets: "/presets/replies-list.css" });

// Register the standard tag and one custom-tag demo used by a story.
defineRepliesList();
defineRepliesList("sk-demo-replies");

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
  },
};

export default preview;
