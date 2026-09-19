import type { Preview } from "@storybook/web-components-vite";

import { configure } from "../src/config";
import { installApiStub } from "./fixtures";
import { defineRepliesList } from "../src/elements/replies-list";
import { defineLogin } from "../src/elements/login";
import { defineReactionList } from "../src/elements/reaction-list";
import { defineReplyComposer } from "../src/elements/reply-composer";

// Elements fetch `https://api.solian.app` — stub it so stories run anywhere.
installApiStub();

// Preset stylesheets for every element, injected via the shared config (the
// same call a CDN host would make with `SunkenLand.configure({ css: … })`).
configure({
  // Reaction stickers (copied from FloatLand's `public/images/stickers`).
  // A host would point this at its CDN, e.g.
  // `https://cdn.solian.app/stickers/{symbol}.webp`.
  stickerUrl: "/stickers/{symbol}.webp",
  css: [
    "/presets/replies-list.css",
    "/presets/login.css",
    "/presets/reply-composer.css",
    "/presets/reactions.css",
  ],
});

// Register the standard tags and one custom-tag demo used by a story.
defineRepliesList();
defineRepliesList("sk-demo-replies");
defineLogin();
defineReactionList();
defineReplyComposer();

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
