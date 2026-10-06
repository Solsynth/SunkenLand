import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { expect, waitFor } from "storybook/test";
import { stubState } from "../../.storybook/fixtures";
import type { FileLike } from "../utils/files";

/** The element's JavaScript-only `attachments` property (see `MediaCollection.vue`). */
type CollectionHandle = HTMLElement & { attachments: FileLike[] | null };

/** unlazy swaps `data-src` into `src` once preloaded, so read both. */
const srcOf = (img: Element | null | undefined): string | null =>
  img?.getAttribute("data-src") ?? img?.getAttribute("src") ?? null;

/**
 * `sk-media-collection` — a LIST of drive files, the embeddable port of
 * FloatLand's `AttachmentGrid`: one file fills a box at its aspect ratio,
 * several become a snapping horizontal list with a `n/total` counter, scroll
 * arrows, and a "Show N more" toggle. All files come from `files` (drive file
 * ids, resolved through `GET /drive/files/{id}/info`) or from the
 * `attachments` property for a host that already holds them.
 *
 * A single file is `sk-media`'s job — this element is the list.
 */

interface CollectionArgs {
  files: string;
  maxVisible?: number;
  flush?: boolean;
  fit?: string;
  css?: string;
}

const render = (args: CollectionArgs) => html`
  <sk-media-collection
    files="${ifDefined(args.files)}"
    max-visible="${ifDefined(args.maxVisible)}"
    ?flush="${args.flush}"
    fit="${ifDefined(args.fit)}"
    css="${ifDefined(args.css)}"
  ></sk-media-collection>
`;

const meta: Meta<CollectionArgs> = {
  title: "Elements/sk-media-collection",
  tags: ["autodocs"],
  render,
  argTypes: {
    files: {
      control: "text",
      description:
        "Drive file ids. Fixture ids (`a_single_img`, `a_reply_clip`, `a_reply_voice`, `a_reply_spec`) render offline; real ids need the API toolbar set to Live.",
    },
    maxVisible: {
      control: { type: "number", min: 1 },
      description: 'Items shown before the "Show N more" toggle.',
    },
    flush: {
      control: "boolean",
      description: "Full-bleed single file over a blurred backdrop copy.",
    },
    fit: { control: "text", description: "`cover` (default) or `contain`." },
    css: {
      control: "text",
      description:
        "Per-element stylesheet override (overrides configured `css`; `css=\"\"` disables styling).",
    },
  },
  args: {
    files: "a_single_img, a_reply_clip, a_reply_voice, a_reply_spec",
    maxVisible: 2,
    fit: "cover",
  },
};

export default meta;

type Story = StoryObj<CollectionArgs>;

/** Four files (image, video, audio, document) with a "show more" toggle. */
export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-media-collection");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;

    await step("every id resolves through the drive info endpoint", async () => {
      await waitFor(() => expect(sr.querySelectorAll(".sk-media__item").length).toBe(2));
      const paths = stubState.requests.map((request) => request.path);
      await expect(paths).toContain("/drive/files/a_single_img/info");
      await expect(paths).toContain("/drive/files/a_reply_spec/info");
      await expect(sr.querySelector(".sk-media__counter")?.textContent?.trim()).toBe("1/4");
    });

    await step("show more reveals the remaining files", async () => {
      const more = sr.querySelector(".sk-media__more") as HTMLButtonElement;
      await expect(more.textContent?.trim()).toBe("Show 2 more");
      more.click();
      await waitFor(() => expect(sr.querySelectorAll(".sk-media__item").length).toBe(4));
      await expect(sr.querySelector(".sk-media__audio")).not.toBeNull();
      await expect(sr.querySelector(".sk-media__file")).not.toBeNull();
    });

    await step("clicking a file dispatches a cancelable media-click", async () => {
      const originalOpen = window.open;
      const opened: string[] = [];
      window.open = ((url: string) => {
        opened.push(String(url));
        return null;
      }) as unknown as typeof window.open;
      try {
        const fired = new Promise<{ url: string; index: number }>((resolve) => {
          el.addEventListener(
            "media-click",
            (event) => {
              const e = event as CustomEvent<{ url: string; index: number }>;
              resolve({ url: e.detail.url, index: e.detail.index });
            },
            { once: true },
          );
        });
        // Tile 2 is the video: no direct `url` fixture, so it must resolve by id.
        const tile = sr.querySelectorAll<HTMLElement>(".sk-media__item")[1];
        if (!tile) throw new Error("video tile missing");
        tile.click();
        const detail = await fired;
        await expect(detail.index).toBe(1);
        await expect(detail.url).toBe("https://api.solian.app/drive/files/a_reply_clip");
        await expect(opened).toEqual(["https://api.solian.app/drive/files/a_reply_clip"]);
      } finally {
        window.open = originalOpen;
      }
    });
  },
};

/** A lone id uses the single-file layout: box at the file's aspect ratio. */
export const SingleFile: Story = {
  args: { files: "a_single_img" },
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-media-collection");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;

    await step("the box keeps the file's aspect ratio", async () => {
      await waitFor(() => expect(sr.querySelector(".sk-media__single")).not.toBeNull());
      const box = sr.querySelector<HTMLElement>(".sk-media__single");
      await expect(parseFloat(box?.style.aspectRatio ?? "")).toBeCloseTo(800 / 450, 3);
      await expect(srcOf(sr.querySelector(".sk-media__img"))).toBe(
        "https://api.solian.app/drive/files/a_single_img",
      );
    });
  },
};

/** `flush` letterboxes over a blurred copy of the image, Solian-app style. */
export const Flush: Story = {
  args: { files: "a_single_img", flush: true },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-media-collection");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    await waitFor(() => expect(sr.querySelector(".sk-media__backdrop")).not.toBeNull());
    await expect(sr.querySelector('[part="media"]')?.getAttribute("data-flush")).toBe("true");
  },
};

/** `fit="contain"` letterboxes the media inside its box. */
export const ContainFit: Story = {
  args: { files: "a_single_img", fit: "contain" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-media-collection");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(
        el.shadowRoot?.querySelector(".sk-media__img")?.getAttribute("data-fit"),
      ).toBe("contain"),
    );
  },
};

/**
 * A host that already holds the files (a post's `attachments`) hands them over
 * with the `attachments` property and skips every request.
 */
export const AttachmentProperty: Story = {
  render: () => html`<sk-media-collection id="by-property" max-visible="6"></sk-media-collection>`,
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-media-collection") as CollectionHandle | null;
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");

    await step("no files attribute and no attachments → the error state", async () => {
      await waitFor(() =>
        expect(el.getAttribute("data-error")).toContain("Missing required `files` attribute."),
      );
      await expect(el.shadowRoot?.querySelector('[part="error"]')).not.toBeNull();
    });

    await step("assigning the property renders the files without a request", async () => {
      stubState.requests.length = 0;
      el.attachments = [
        {
          id: "a_prop_img",
          name: "from-host.png",
          url: null,
          mimeType: "image/png",
          hasCompression: false,
          hasThumbnail: true,
          fileMeta: { width: 400, height: 400 },
        },
      ];
      await waitFor(() =>
        expect(el.shadowRoot?.querySelector(".sk-media__img")).not.toBeNull(),
      );
      await expect(srcOf(el.shadowRoot?.querySelector(".sk-media__img"))).toBe(
        "https://api.solian.app/drive/files/a_prop_img",
      );
      await expect(stubState.requests.filter((r) => r.path.includes("info")).length).toBe(0);
    });
  },
};

/** Missing `files` (and no `attachments` property) → inline error state. */
export const MissingFiles: Story = {
  args: { files: "" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-media-collection");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector('[part="error"]')).not.toBeNull(),
    );
    await expect(el.getAttribute("data-error")).toContain(
      "Missing required `files` attribute.",
    );
  },
};

/**
 * Real drive files, straight from `api.solian.app`: `parameters.liveApi`
 * forwards the metadata requests (and the images) to the live API, so `files`
 * can be any real ids — paste them from solian.app (the defaults are public).
 */
export const LiveCollection: Story = {
  args: {
    files: "01M48QXKG9AK9WMYFC4RMSS26X, 01M48SNHMZQ34TXZKRMJQX7JG1, 01M48SNHZ08CW9QXVTS4B7MJ4V",
    maxVisible: 2,
  },
  parameters: { liveApi: true },
  // No play function, and `!test` keeps the Vitest addon from ever fetching
  // the real API from CI.
  tags: ["!test"],
};

/** The element can be registered under a custom tag via `defineMediaCollection`. */
export const CustomTag: Story = {
  render: (args) => html`
    <sk-demo-media-collection
      files="${ifDefined(args.files)}"
      max-visible="${ifDefined(args.maxVisible)}"
      css="${ifDefined(args.css)}"
    ></sk-demo-media-collection>
  `,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-demo-media-collection");
    await waitFor(() =>
      expect(el?.shadowRoot?.querySelector(".sk-media__item")).not.toBeNull(),
    );
  },
};
