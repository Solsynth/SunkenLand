import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { expect, waitFor } from "storybook/test";
import { stubState } from "../../.storybook/fixtures";
import type { FileLike } from "../utils/files";

/** The element's JavaScript-only `attachment` property (see `MediaFile.vue`). */
type MediaHandle = HTMLElement & { attachment: FileLike | null };

/**
 * unlazy renders the real URL as `data-src` and swaps it into `src` once the
 * image is preloaded (removing `data-src`), so read both.
 */
const srcOf = (img: Element | null | undefined): string | null =>
  img?.getAttribute("data-src") ?? img?.getAttribute("src") ?? null;

/**
 * `sk-media` — ONE drive file, rendered like FloatLand's `AttachmentItem`: an
 * image through unlazy, a video with a play overlay, an `<audio controls>`, or
 * a file card, in a box at the file's aspect ratio.
 *
 * Stories render the actual custom element; `file` takes a drive file id and
 * the fetch stub in `.storybook/fixtures.ts` answers
 * `GET /drive/files/{id}/info` with the fixture metadata (name, MIME type,
 * dimensions, blurhash). A list of files is `sk-media-collection`'s job.
 */

interface MediaArgs {
  file: string;
  fit?: string;
  css?: string;
}

const render = (args: MediaArgs) => html`
  <sk-media
    file="${ifDefined(args.file)}"
    fit="${ifDefined(args.fit)}"
    css="${ifDefined(args.css)}"
  ></sk-media>
`;

const meta: Meta<MediaArgs> = {
  title: "Elements/sk-media",
  tags: ["autodocs"],
  render,
  argTypes: {
    file: {
      control: "text",
      description:
        "Drive file id. Fixture ids (`a_single_img`, `a_reply_clip`, `a_reply_voice`, `a_reply_spec`) render offline; a real id needs the API toolbar set to Live.",
    },
    fit: { control: "text", description: "`cover` (default) or `contain`." },
    css: {
      control: "text",
      description:
        "Per-element stylesheet override (overrides configured `css`; `css=\"\"` disables styling).",
    },
  },
  args: {
    file: "a_single_img",
  },
};

export default meta;

type Story = StoryObj<MediaArgs>;

/** One image: box at the file's aspect ratio, URL from the drive endpoint. */
export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-media");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;

    await step("the file's metadata comes from the drive info endpoint", async () => {
      await waitFor(() => expect(sr.querySelector(".sk-media__single")).not.toBeNull());
      await expect(
        stubState.requests.filter((r) => r.path === "/drive/files/a_single_img/info").length,
      ).toBeGreaterThan(0);
    });

    await step("the image resolves through the drive endpoint and lazy loads", async () => {
      const img = sr.querySelector(".sk-media__img");
      await expect(srcOf(img)).toBe("https://api.solian.app/drive/files/a_single_img");
      // Metadata feeds the blurhash placeholder's aspect ratio.
      await expect(img?.getAttribute("width")).toBe("800");
      await expect(img?.getAttribute("height")).toBe("450");
    });

    await step("the box keeps the file's aspect ratio", async () => {
      const box = sr.querySelector<HTMLElement>(".sk-media__single");
      await expect(parseFloat(box?.style.aspectRatio ?? "")).toBeCloseTo(800 / 450, 3);
      await expect(box?.style.maxHeight).toBe("500px");
    });
  },
};

/** Every file kind: image, video (play overlay), audio, and a generic file. */
export const Kinds: Story = {
  render: () => html`
    <sk-media file="a_single_img"></sk-media>
    <sk-media file="a_reply_clip"></sk-media>
    <sk-media file="a_reply_voice"></sk-media>
    <sk-media file="a_reply_spec"></sk-media>
  `,
  play: async ({ canvasElement, step }) => {
    const [image, video, audio, file] = [
      ...canvasElement.querySelectorAll("sk-media"),
    ].map((el) => el.shadowRoot);
    if (!image || !video || !audio || !file) throw new Error("elements not upgraded");

    await step("each kind gets its own presentation", async () => {
      await waitFor(() => expect(video.querySelector(".sk-media__video")).not.toBeNull());
      await expect(image.querySelector(".sk-media__img")).not.toBeNull();
      await expect(video.querySelector(".sk-media__play")).not.toBeNull();
      await expect(audio.querySelector("audio[controls]")).not.toBeNull();
      await expect(file.querySelector(".sk-media__file")).not.toBeNull();
    });

    await step("names come from the drive metadata", async () => {
      await expect(video.querySelector(".sk-media__name")?.textContent?.trim()).toBe("clip.mp4");
      await expect(file.querySelector(".sk-media__name")?.textContent?.trim()).toBe("spec.pdf");
    });
  },
};

/** `fit="contain"` letterboxes the media inside its box. */
export const ContainFit: Story = {
  args: { fit: "contain" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-media");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(
        el.shadowRoot?.querySelector(".sk-media__img")?.getAttribute("data-fit"),
      ).toBe("contain"),
    );
  },
};

/**
 * Clicking dispatches a cancelable `media-click` with the file and its URL; the
 * default action (open in a new tab) happens unless the host cancels it.
 */
export const Click: Story = {
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-media");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");

    await step("the default action opens the file in a new tab", async () => {
      const originalOpen = window.open;
      const opened: string[] = [];
      window.open = ((url: string) => {
        opened.push(String(url));
        return null;
      }) as unknown as typeof window.open;
      try {
        await waitFor(() => expect(el.shadowRoot?.querySelector(".sk-media__single")).not.toBeNull());
        const box = el.shadowRoot?.querySelector<HTMLElement>(".sk-media__single");
        if (!box) throw new Error("single-file box missing");
        const fired = new Promise<{ url: string; fileId: string; composed: boolean }>((resolve) => {
          el.addEventListener(
            "media-click",
            (event) => {
              const e = event as CustomEvent<{ url: string; file: { id: string } }>;
              resolve({ url: e.detail.url, fileId: e.detail.file.id, composed: e.composed });
            },
            { once: true },
          );
        });
        box.click();
        const detail = await fired;
        await expect(detail.fileId).toBe("a_single_img");
        await expect(detail.url).toBe("https://api.solian.app/drive/files/a_single_img");
        await expect(detail.composed).toBe(true);
        await expect(opened).toEqual(["https://api.solian.app/drive/files/a_single_img"]);
      } finally {
        window.open = originalOpen;
      }
    });

    await step("preventDefault suppresses the default action", async () => {
      const originalOpen = window.open;
      const opened: string[] = [];
      window.open = ((url: string) => {
        opened.push(String(url));
        return null;
      }) as unknown as typeof window.open;
      const cancel = (event: Event) => event.preventDefault();
      el.addEventListener("media-click", cancel);
      try {
        const box = el.shadowRoot?.querySelector<HTMLElement>(".sk-media__single");
        if (!box) throw new Error("single-file box missing");
        box.click();
        await expect(opened).toEqual([]);
      } finally {
        el.removeEventListener("media-click", cancel);
        window.open = originalOpen;
      }
    });
  },
};

/**
 * A host that already holds the file object hands it over with the
 * `attachment` property (JavaScript-only) and skips the metadata request.
 */
export const AttachmentProperty: Story = {
  render: () => html`<sk-media id="by-property"></sk-media>`,
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-media") as MediaHandle | null;
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");

    await step("no file attribute and no attachment → the error state", async () => {
      await waitFor(() =>
        expect(el.getAttribute("data-error")).toContain("Missing required `file` attribute."),
      );
      await expect(el.shadowRoot?.querySelector('[part="error"]')).not.toBeNull();
    });

    await step("assigning the property renders the file without a request", async () => {
      stubState.requests.length = 0;
      el.attachment = {
        id: "a_prop_img",
        name: "from-host.png",
        url: null,
        mimeType: "image/png",
        hasCompression: false,
        hasThumbnail: true,
        fileMeta: { width: 400, height: 400 },
      };
      await waitFor(() =>
        expect(el.shadowRoot?.querySelector(".sk-media__img")).not.toBeNull(),
      );
      await expect(srcOf(el.shadowRoot?.querySelector(".sk-media__img"))).toBe(
        "https://api.solian.app/drive/files/a_prop_img",
      );
      await expect(stubState.requests.length).toBe(0);
    });
  },
};

/** Missing `file` (and no `attachment` property) → inline error state. */
export const MissingFile: Story = {
  args: { file: "" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-media");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector('[part="error"]')).not.toBeNull(),
    );
    await expect(el.getAttribute("data-error")).toContain("Missing required `file` attribute.");
  },
};

/** Several ids belong to `sk-media-collection` — reported, not silently cut. */
export const MultipleIds: Story = {
  args: { file: "a_single_img, a_reply_clip" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-media");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.getAttribute("data-error")).toContain("use `sk-media-collection` for a list"),
    );
    await expect(stubState.requests.filter((r) => r.path.includes("info")).length).toBe(0);
  },
};

/**
 * A real drive file, straight from `api.solian.app`: `parameters.liveApi`
 * forwards the metadata request (and the image) to the live API, so `file` can
 * be any real id — paste one from solian.app (the default is a public one).
 */
export const LiveFile: Story = {
  args: { file: "01M48QXKG9AK9WMYFC4RMSS26X" },
  parameters: { liveApi: true },
  // No play function, and `!test` keeps the Vitest addon from ever fetching
  // the real API from CI.
  tags: ["!test"],
};

/** The element can be registered under a custom tag via `defineMedia`. */
export const CustomTag: Story = {
  render: (args) => html`
    <sk-demo-media file="${ifDefined(args.file)}" css="${ifDefined(args.css)}"></sk-demo-media>
  `,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-demo-media");
    await waitFor(() =>
      expect(el?.shadowRoot?.querySelector(".sk-media__img")).not.toBeNull(),
    );
  },
};
