import type { Preview } from "@storybook/web-components-vite";

import { configure } from "../src/config";
import { installApiStub, setLiveApi } from "./fixtures";
import { defineRepliesList } from "../src/elements/replies-list";
import { defineLogin } from "../src/elements/login";
import { defineReactionList } from "../src/elements/reaction-list";
import { defineReplyComposer } from "../src/elements/reply-composer";
import { defineMedia, defineMediaCollection } from "../src/elements/media";

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
    "/presets/media.css",
    "/presets/login.css",
    "/presets/reply-composer.css",
    "/presets/reactions.css",
  ],
});

// Register the standard tags and the custom-tag demos used by stories.
defineRepliesList();
defineRepliesList("sk-demo-replies");
defineLogin();
defineReactionList();
defineReplyComposer();
defineMedia();
defineMedia("sk-demo-media");
defineMediaCollection();
defineMediaCollection("sk-demo-media-collection");

/**
 * Toolbar switch for where elements read from. `Stubbed` (the default) serves
 * deterministic fixtures so play tests run offline; `Live` forwards to
 * `https://api.solian.app`, letting a story render real data — e.g. edit
 * `sk-replies-list`'s `post` to a real post id.
 */
export const globalTypes = {
  liveApi: {
    description: "API the elements read from.",
    toolbar: {
      title: "API",
      icon: "globe",
      items: [
        { value: "stub", title: "Stubbed" },
        { value: "live", title: "Live (api.solian.app)" },
      ],
      dynamicTitle: true,
    },
  },
};

export const initialGlobals = { liveApi: "stub" };

const preview: Preview = {
  // A story opts into the live API either with the toolbar above or with
  // `parameters: { liveApi: true }` (useful for a dedicated live story).
  decorators: [
    (story, context) => {
      setLiveApi(
        context.globals.liveApi === "live" || Boolean(context.parameters.liveApi),
      );
      return story();
    },
  ],
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
