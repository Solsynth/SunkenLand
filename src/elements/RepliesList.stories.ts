import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { expect, waitFor } from "storybook/test";
import { configure } from "../config";

/**
 * `sk-replies-list` — threaded reply list for a parent post.
 *
 * Stories render the actual custom element, exactly as an embedding host would
 * use it: attributes map to args. The preset stylesheet comes from the shared
 * config — `.storybook/preview.ts` calls `configure({ css:
 * "/presets/replies-list.css" })`, the same call a CDN host makes via
 * `SunkenLand.configure(...)` — and is injected into the shadow root.
 *
 * The fetch stub in `.storybook/fixtures.ts` serves the API wire payloads, so
 * the interactions below (pagination, events, live config re-sync) are real
 * tests that also run headlessly via `bun run test` (Vitest + browser).
 *
 * The toolbar's **API** switch flips the stub to **Live (api.solian.app)**, and
 * the `LivePost` story below uses `parameters: { liveApi: true }` to do the
 * same: edit `post` to any real post id and the element reads the real thread.
 */

interface RepliesListArgs {
  post: string;
  take?: number;
  offset?: number;
  queryTerm?: string;
  realm?: string;
  media?: boolean;
  orderDesc?: boolean;
  type?: string;
  pub?: string;
  header?: boolean;
  viewAllUrl?: string;
  css?: string;
}

const render = (args: RepliesListArgs) => html`
  <sk-replies-list
    post="${args.post}"
    take="${args.take ?? 6}"
    offset="${args.offset ?? 0}"
    query-term="${ifDefined(args.queryTerm)}"
    realm="${ifDefined(args.realm)}"
    ?media="${args.media}"
    ?order-desc="${args.orderDesc}"
    type="${ifDefined(args.type)}"
    pub="${ifDefined(args.pub)}"
    ?header="${args.header}"
    view-all-url="${ifDefined(args.viewAllUrl)}"
    css="${ifDefined(args.css)}"
  ></sk-replies-list>
`;

/**
 * unlazy renders the real URL as `data-src` and swaps it into `src` once the
 * image is preloaded (removing `data-src`), so read both.
 */
const srcOf = (img: Element | null | undefined): string | null =>
  img?.getAttribute("data-src") ?? img?.getAttribute("src") ?? null;

const meta: Meta<RepliesListArgs> = {
  title: "Elements/sk-replies-list",
  tags: ["autodocs"],
  render,
  argTypes: {
    post: {
      control: "text",
      description: "Parent post id (required).",
    },
    take: { control: { type: "number", min: 1 }, description: "Page size." },
    offset: { control: { type: "number", min: 0 }, description: "Initial offset." },
    queryTerm: { control: "text", description: "Filter: forwarded as `query`." },
    realm: { control: "text", description: "Filter: realm slug." },
    media: { control: "boolean", description: "Filter: media only." },
    orderDesc: { control: "boolean", description: "Filter: newest first." },
    type: { control: "text", description: "Filter: post type." },
    pub: { control: "text", description: "Filter: publisher." },
    header: { control: "boolean", description: "Show the reply-count header." },
    viewAllUrl: { control: "text", description: "Link to the full conversation." },
    css: {
      control: "text",
      description: "Per-element stylesheet override (overrides configured `css`; `css=\"\"` disables styling).",
    },
  },
  args: {
    post: "post_1",
    take: 2,
    offset: 0,
    queryTerm: "migration",
    orderDesc: true,
    header: true,
    viewAllUrl: "https://solian.app/posts/post_1",
  },
};

export default meta;

type Story = StoryObj<RepliesListArgs>;

export const Default: Story = {};

/** `css=""` opts this element out of the configured preset → bare markup. */
export const Unstyled: Story = {
  name: "Unstyled (css=\"\" disables preset)",
  args: { css: "" },
};

/** Missing required `post` attribute → inline error state. */
export const MissingPost: Story = {
  args: { post: "" },
};

/** A post with no replies renders an empty state (fetch returns x-total 0). */
export const Empty: Story = {
  args: { post: "post_empty" },
};

/**
 * Real data: `parameters.liveApi` makes the stub forward to
 * `https://api.solian.app`, so `post` is a real post id — paste any id from
 * solian.app (the default is a public post that has replies).
 */
export const LivePost: Story = {
  args: {
    post: "01a11173-2a88-72a4-87cb-546aaddb046d",
    queryTerm: undefined,
    viewAllUrl: "https://solian.app/posts/01a11173-2a88-72a4-87cb-546aaddb046d",
  },
  parameters: { liveApi: true },
  // No play function, and `!test` keeps the Vitest addon from ever fetching
  // the real API from CI.
  tags: ["!test"],
};

/**
 * Reply attachments render through the same media grid `sk-media` uses, and an
 * avatar whose wire object has `url: null` resolves through the drive endpoint
 * by file id (the shape the real API sends).
 */
export const Attachments: Story = {
  args: { take: 6, queryTerm: undefined },
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-replies-list");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    const replies = () => [...sr.querySelectorAll<HTMLElement>(".sk-reply")];

    await step("an avatar without a direct URL resolves through the drive endpoint", async () => {
      await waitFor(() => expect(replies().length).toBe(5));
      // Row 3 is Carol's reply: `picture: { id, url: null }`.
      await expect(srcOf(replies()[2]?.querySelector(".sk-reply__avatar img"))).toBe(
        "https://api.solian.app/drive/files/f_carol",
      );
    });

    await step("a lone attachment fills a box at its aspect ratio", async () => {
      const box = replies()[2]?.querySelector(".sk-media__single");
      await expect(box).not.toBeNull();
      await expect(srcOf(box?.querySelector("img"))).toBe(
        "https://api.solian.app/drive/files/a_single_img",
      );
      await expect(parseFloat((box as HTMLElement).style.aspectRatio)).toBeCloseTo(800 / 450, 3);
    });

    await step("several attachments render as a strip with a counter", async () => {
      const row = replies()[3];
      await expect(row?.querySelectorAll(".sk-media__item").length).toBe(4);
      await expect(row?.querySelector(".sk-media__counter")?.textContent?.trim()).toBe("1/4");
      await expect(row?.querySelector(".sk-media__video")).not.toBeNull();
      await expect(row?.querySelector(".sk-media__audio")).not.toBeNull();
      await expect(row?.querySelector(".sk-media__file")).not.toBeNull();
    });

    await step("clicking an attachment dispatches media-click, not reply-click", async () => {
      const row = replies()[3];
      let replyClicks = 0;
      el.addEventListener("reply-click", () => replyClicks++, { once: true });
      const fired = new Promise<{ postId: string; index: number; url: string }>((resolve) => {
        el.addEventListener(
          "media-click",
          (event) => {
            const detail = (event as CustomEvent<{ postId: string; index: number; url: string }>)
              .detail;
            resolve({ postId: detail.postId, index: detail.index, url: detail.url });
          },
          { once: true },
        );
      });
      // Tile 2 is the video: no direct `url` fixture, so it must resolve by id.
      const tile = row?.querySelectorAll<HTMLElement>(".sk-media__item")[1];
      if (!tile) throw new Error("video attachment tile missing");
      tile.click();
      const detail = await fired;
      await expect(detail.postId).toBe("r4");
      await expect(detail.index).toBe(1);
      await expect(detail.url).toBe("https://api.solian.app/drive/files/a_reply_clip");
      await expect(replyClicks).toBe(0);
    });
  },
};

/** The element can be registered under a custom tag via `defineRepliesList`. */
export const CustomTag: Story = {
  render: (args) => html`
    <sk-demo-replies
      post="${args.post}"
      take="${args.take ?? 6}"
      ?order-desc="${args.orderDesc}"
      css="${ifDefined(args.css)}"
    ></sk-demo-replies>
  `,
};

/** Pagination: initial page, then "Load more" appends until total is reached. */
export const LoadMore: Story = {
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-replies-list");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");

    await step("initial page renders `take` replies", async () => {
      const sr = el.shadowRoot;
      if (!sr) throw new Error("element not upgraded");
      await waitFor(() => expect(sr.querySelectorAll(".sk-reply").length).toBe(2));
    });
    await step("load more appends the next page", async () => {
      const sr = el.shadowRoot;
      if (!sr) throw new Error("element not upgraded");
      const button = sr.querySelector(".sk-load-more") as HTMLButtonElement;
      button.click();
      await waitFor(() => expect(sr.querySelectorAll(".sk-reply").length).toBe(4));
    });
    await step("loading to the end hides the button", async () => {
      const sr = el.shadowRoot;
      if (!sr) throw new Error("element not upgraded");
      const button = sr.querySelector(".sk-load-more") as HTMLButtonElement;
      button.click();
      await waitFor(() => expect(sr.querySelectorAll(".sk-reply").length).toBe(5));
      await waitFor(() => expect(sr.querySelector(".sk-load-more")).toBeNull());
    });
  },
};

/**
 * Configured stylesheets inject into the shadow root and re-sync live:
 * `configure({ css })` adds `<link>`s to already-mounted elements,
 * and clearing them removes the links. The `css` attribute overrides.
 */
export const ConfiguredStylesheet: Story = {
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-replies-list");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    const countLinks = () => sr.querySelectorAll("link[rel=stylesheet]").length;

    await step("clearing configured stylesheets removes injected links", async () => {
      configure({ css: [] });
      await waitFor(() => expect(countLinks()).toBe(0));
    });
    await step("configure with a stylesheet injects a link into the shadow root", async () => {
      configure({ css: "/presets/replies-list.css" });
      await waitFor(() => expect(countLinks()).toBe(1));
      await expect(sr.querySelector("link[rel=stylesheet]")?.getAttribute("href")).toBe("/presets/replies-list.css");
    });
    await step("per-element css attribute overrides the configured stylesheet", async () => {
      el.setAttribute("css", "/presets/other.css");
      await waitFor(() => expect(countLinks()).toBe(1));
      await expect(sr.querySelector("link[rel=stylesheet]")?.getAttribute("href")).toBe("/presets/other.css");
      el.removeAttribute("css");
      await waitFor(() => expect(sr.querySelector("link[rel=stylesheet]")?.getAttribute("href")).toBe("/presets/replies-list.css"));
    });

    // Restore the preview default so later stories see the preset again.
    configure({ css: "/presets/replies-list.css" });
  },
};

/**
 * Named slots project light-DOM children into the shadow root, so hosts can
 * replace the chrome (header, states, controls) without touching CSS.
 */
export const CustomSlots: Story = {
  render: (args) => html`
    <sk-replies-list
      post="${args.post}"
      take="2"
      ?order-desc="${args.orderDesc}"
      view-all-url="https://solian.app/posts/post_1"
    >
      <span slot="header">Discussion</span>
      <button slot="load-more" type="button">More replies</button>
      <span slot="view-all">See the whole thread</span>
    </sk-replies-list>
    <sk-replies-list id="err-slot" post="">
      <span slot="error">Could not load — try again</span>
    </sk-replies-list>
  `,
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-replies-list");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    // textContent/innerHTML of a shadow <slot> only reflects fallback nodes;
    // projected light-DOM content is visible via assignedNodes().
    const assignedText = (slot: HTMLSlotElement | null | undefined): string[] =>
      slot?.assignedNodes().map((n) => (n.textContent ?? "").trim()) ?? [];

    await step("header slot replaces the default count", async () => {
      await waitFor(() => expect(assignedText(sr.querySelector('slot[name="header"]'))).toEqual(["Discussion"]));
    });
    await step("load-more slot replaces the button label", async () => {
      const button = sr.querySelector(".sk-load-more") as HTMLButtonElement;
      await waitFor(() => expect(assignedText(button.querySelector('slot[name="load-more"]'))).toEqual(["More replies"]));
      button.click();
      await waitFor(() => expect(sr.querySelectorAll(".sk-reply").length).toBe(4));
    });
    await step("view-all slot replaces the link label", async () => {
      await expect(assignedText(sr.querySelector('.sk-view-all slot[name="view-all"]'))).toEqual(["See the whole thread"]);
    });

    const errEl = canvasElement.querySelector("#err-slot") as HTMLElement;
    if (!errEl || !errEl.shadowRoot) throw new Error("error-slot element not upgraded");
    await step("error slot replaces the message and data-error mirrors it on the host", async () => {
      await waitFor(() =>
        expect(assignedText(errEl.shadowRoot?.querySelector('slot[name="error"]'))).toEqual(["Could not load — try again"]),
      );
      await waitFor(() => expect(errEl.getAttribute("data-error")).toContain("Missing required `post` attribute."));
    });
  },
};

/**
 * Clicking a reply dispatches `reply-click` with `detail = { postId, post }`,
 * bubbling and composed so it crosses the shadow boundary.
 */
export const ReplyClick: Story = {
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-replies-list");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");

    await step("a reply row dispatches a composed reply-click event", async () => {
      await waitFor(() => expect(el.shadowRoot?.querySelectorAll(".sk-reply").length).toBe(2));
      const fired = new Promise<{ postId: string; composed: boolean }>((resolve) => {
        el.addEventListener(
          "reply-click",
          (e) => resolve({ postId: (e as CustomEvent<{ postId: string }>).detail.postId, composed: e.composed }),
          { once: true },
        );
      });
      const sr = el.shadowRoot;
      if (!sr) throw new Error("element not upgraded");
      (sr.querySelector(".sk-reply") as HTMLElement).click();
      const detail = await fired;
      await expect(detail.postId).toBe("r1");
      await expect(detail.composed).toBe(true);
    });
  },
};
