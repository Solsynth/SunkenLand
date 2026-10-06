import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { expect, waitFor } from "storybook/test";
import { postFixture, stubState } from "../../.storybook/fixtures";
import type { SnPost } from "../api";
import { formatCount } from "../utils/format";
import { renderMarkdown } from "../utils/markdown";

/** The element's JavaScript-only `post` property (see `PostCard.vue`). */
type PostHandle = HTMLElement & { post: string | SnPost | null };

/**
 * `sk-post` — one whole post, the embeddable port of FloatLand's `PostCard.vue`:
 * author header with the colourful name, the replied/forwarded reference, the
 * Markdown body, attachments through the shared media grid, tags, metadata, a
 * reaction summary, and the stats footer.
 *
 * Stories render the actual custom element; `post` takes a post id and the
 * fetch stub in `.storybook/fixtures.ts` answers `GET /sphere/posts/{id}` with
 * fixture posts shaped like the real wire payloads. A host that already holds
 * the post hands it over with the `post` property and skips the request.
 */

interface PostArgs {
  post?: string;
  detail?: boolean;
  variant?: string;
  reference?: boolean;
  media?: boolean;
  reactions?: string;
  maxTags?: number;
  maxChips?: number;
  url?: string;
  publisherUrl?: string;
  tagUrl?: string;
  css?: string;
}

const render = (args: PostArgs) => html`
  <sk-post
    post="${ifDefined(args.post)}"
    variant="${ifDefined(args.variant)}"
    max-tags="${ifDefined(args.maxTags)}"
    max-chips="${ifDefined(args.maxChips)}"
    reactions="${ifDefined(args.reactions)}"
    url="${ifDefined(args.url)}"
    publisher-url="${ifDefined(args.publisherUrl)}"
    tag-url="${ifDefined(args.tagUrl)}"
    css="${ifDefined(args.css)}"
    detail="${args.detail ? "" : "false"}"
    reference="${args.reference === false ? "false" : ""}"
    media="${args.media === false ? "false" : ""}"
  ></sk-post>
`;

const meta: Meta<PostArgs> = {
  title: "Elements/sk-post",
  tags: ["autodocs"],
  render,
  argTypes: {
    post: {
      control: "text",
      description:
        "Post id, resolved through `GET /sphere/posts/{post}` (public). Fixture ids (`post_rich`, `post_reference`, `post_forwarded`, `post_truncated`, `post_article`, `post_private`, `post_plain`, `post_empty`) render offline; a real post needs the API toolbar set to Live.",
    },
    detail: {
      control: "boolean",
      description: "Full-post presentation: no body truncation, views, all tags.",
    },
    variant: { control: "text", description: "`card` (default) or `feed`." },
    reference: {
      control: "boolean",
      description: "Show the replied/forwarded preview (default on).",
    },
    media: {
      control: "boolean",
      description: "Render attachments (default on).",
    },
    reactions: {
      control: "text",
      description: "`summary` (default) or `off`.",
    },
    maxTags: { control: "number" },
    maxChips: { control: "number" },
    url: {
      control: "text",
      description:
        "Where the post points (`{id}`/`{name}` expanded); opened on click unless canceled.",
    },
    publisherUrl: {
      control: "text",
      description: "Author link template, e.g. `https://solian.app/publishers/{name}`.",
    },
    tagUrl: {
      control: "text",
      description: "Tag link template, e.g. `https://solian.app/tags/{slug}`.",
    },
    css: { control: "text" },
  },
  args: {
    post: "post_rich",
  },
};

export default meta;

type Story = StoryObj<PostArgs>;

/** The Markdown body renders as escaped HTML with external links, nothing more. */
export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;

    await step("the post comes from the public post endpoint", async () => {
      await waitFor(() =>
        expect(sr.querySelector('[part="publisher"]')?.textContent).toBe("Alice"),
      );
      await expect(
        stubState.requests.filter((r) => r.path === "/sphere/posts/post_rich").length,
      ).toBeGreaterThan(0);
    });

    await step("the header carries the handle, the time, and the coloured name", async () => {
      await expect(sr.querySelector('[part="handle"]')?.textContent).toContain("@alice");
      await expect(sr.querySelector('[part="time"]')).not.toBeNull();
      // The fixture publisher is a `nova` account with the `teal` palette colour.
      const probe = document.createElement("span");
      probe.style.color = "#14b8a6";
      canvasElement.append(probe);
      const name = sr.querySelector('[part="publisher"]');
      await expect(getComputedStyle(name as Element).color).toBe(
        getComputedStyle(probe).color,
      );
    });

    await step("the body renders Markdown: headings, lists, code, quotes, links", async () => {
      const content = sr.querySelector('[part="content"]');
      await expect(content?.querySelector("h1")?.textContent).toBe("Release notes");
      await expect(content?.querySelectorAll("ul li").length).toBe(2);
      await expect(content?.querySelector("blockquote")?.textContent).toContain("quoted line");
      await expect(content?.querySelector("pre code")?.textContent).toContain("const answer = 42;");
      await expect(content?.querySelector("strong")?.textContent).toBe("bold");
      const link = content?.querySelector("a");
      await expect(link?.getAttribute("href")).toBe("https://solian.app");
      await expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    });

    await step("tags render three plus the overflow chip", async () => {
      const chips = [...sr.querySelectorAll('[part="tag"]')];
      await expect(chips.length).toBe(3);
      await expect(chips[2]?.textContent).toBe("#art");
      await expect(sr.querySelector('[part="tag-more"]')?.textContent).toBe("+1");
    });

    await step("reactions normalize to canonical symbols with their counts", async () => {
      const chips = [...sr.querySelectorAll('[part="reaction-chip"]')];
      await expect(chips.length).toBe(3);
      await expect(chips.map((chip) => chip.getAttribute("data-symbol"))).toEqual([
        "thumb_up",
        "heart",
        "party",
      ]);
      const count = sr.querySelector('[part="reaction-count"]')?.textContent;
      await expect(count).toBe(formatCount(4));
    });

    await step("the metadata row and stats footer carry the fixture's numbers", async () => {
      await expect(sr.querySelector('[part="edited"]')?.textContent).toContain("Edited");
      await expect(sr.querySelector('[part="visibility"]')).toBeNull();
      // Views are a detail-only affordance, like FloatLand's card.
      await expect(sr.querySelector('[part="views"]')).toBeNull();
      await expect(sr.querySelector('[part="replies"]')?.textContent).toContain(formatCount(12));
      await expect(sr.querySelector('[part="reaction-total"]')?.textContent).toContain(
        formatCount(7),
      );
    });

    await step("attachments render through the shared media grid", async () => {
      await expect(sr.querySelector('[part="media"] .sk-media-grid')).not.toBeNull();
    });
  },
};

/** `detail` shows views and every tag, and keeps the whole body. */
export const Detail: Story = {
  args: { post: "post_rich", detail: true },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    await waitFor(() =>
      expect(sr.querySelector('[part="views"]')?.textContent).toContain(formatCount(3456)),
    );
    await expect(sr.querySelectorAll('[part="tag"]').length).toBe(4);
    await expect(sr.querySelector('[part="tag-more"]')).toBeNull();
  },
};

/** A reply: the reference starts collapsed and expands on the toggle. */
export const Reference: Story = {
  args: { post: "post_reference" },
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;

    await step("the reference is collapsed, labelled, and expandable", async () => {
      await waitFor(() =>
        expect(sr.querySelector('[part="reference-toggle"]')).not.toBeNull(),
      );
      const toggle = sr.querySelector('[part="reference-toggle"]');
      await expect(toggle?.textContent?.trim()).toBe("Replied to");
      await expect(sr.querySelector('[part="reference-body"]')).toBeNull();

      (toggle as HTMLElement).click();
      await waitFor(() =>
        expect(sr.querySelector('[part="reference-body"]')).not.toBeNull(),
      );
      await expect(sr.querySelector('[part="reference-publisher"]')?.textContent).toBe(
        "Alice",
      );
      await expect(sr.querySelector('[part="reference-content"]')?.textContent).toContain(
        "The announcement body",
      );
    });
  },
};

/** A forward reads "Forwarded" instead of "Replied to". */
export const Forwarded: Story = {
  args: { post: "post_forwarded" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector('[part="reference-toggle"]')?.textContent?.trim()).toBe(
        "Forwarded",
      ),
    );
  },
};

/** An API-truncated post keeps the truncation marker. */
export const Truncated: Story = {
  args: { post: "post_truncated" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector('[part="content"]')?.textContent).toContain(
        "cut short...",
      ),
    );
  },
};

/** An article in list presentation: title, description, and its thumbnail. */
export const Article: Story = {
  args: { post: "post_article" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    await waitFor(() =>
      expect(sr.querySelector('[part="title"]')?.textContent).toBe("A long-form article"),
    );
    await expect(sr.querySelector('[part="description"]')?.textContent).toContain(
      "What the article is about",
    );
    // The thumbnail is the attachment `meta.thumbnail` names — not the first
    // attachment (a video) — and a file with a direct URL keeps it.
    const thumb = sr.querySelector('[part="thumbnail"] img');
    await expect(thumb?.getAttribute("src")?.startsWith("data:image/svg+xml")).toBe(true);
    await expect(thumb?.getAttribute("src")).not.toContain("a_reply_clip");
    await expect(sr.querySelector('[part="content"]')).toBeNull();
    await expect(sr.querySelector('[part="media"]')).toBeNull();
  },
};

/** The same article in detail presentation: the body and the media grid. */
export const ArticleDetail: Story = {
  args: { post: "post_article", detail: true },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    await waitFor(() =>
      expect(sr.querySelector('[part="content"]')?.querySelector("h1")?.textContent).toBe(
        "Section one",
      ),
    );
    await expect(sr.querySelector('[part="thumbnail"]')).toBeNull();
    await expect(sr.querySelector('[part="media"]')).not.toBeNull();
  },
};

/** A non-public post says so; the reaction row is simply absent when empty. */
export const Private: Story = {
  args: { post: "post_private" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector('[part="visibility"]')?.textContent?.trim()).toBe(
        "Private",
      ),
    );
    await expect(el.shadowRoot.querySelector('[part="reactions"]')).toBeNull();
  },
};

/** An empty body renders the post without a content region. */
export const EmptyBody: Story = {
  args: { post: "post_empty" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector('[part="publisher"]')).not.toBeNull(),
    );
    await expect(el.shadowRoot.querySelector('[part="content"]')).toBeNull();
    await expect(el.shadowRoot.querySelector('[part="body"]')).not.toBeNull();
    await expect(el.shadowRoot.querySelector('[part="stats"]')).not.toBeNull();
  },
};

/** `reference="false"`, `media="false"` and `reactions="off"` drop those regions. */
export const TextOnly: Story = {
  args: {
    post: "post_rich",
    reference: false,
    media: false,
    reactions: "off",
  },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    await waitFor(() =>
      expect(sr.querySelector('[part="publisher"]')).not.toBeNull(),
    );
    await expect(sr.querySelector('[part="reference"]')).toBeNull();
    await expect(sr.querySelector('[part="media"]')).toBeNull();
    await expect(sr.querySelector('[part="reactions"]')).toBeNull();
    await expect(sr.querySelector('[part="content"]')).not.toBeNull();
  },
};

/** `variant="feed"` is the flat presentation the preset styles. */
export const FeedVariant: Story = {
  args: { post: "post_rich", variant: "feed" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector(".sk-post")?.getAttribute("data-variant")).toBe("feed"),
    );
  },
};

/**
 * URL templates route clicks: `post-click` carries the target and the expanded
 * href, and the default action opens it unless the host cancels.
 */
export const ClickRouting: Story = {
  args: {
    post: "post_rich",
    url: "https://solian.app/posts/{id}",
    publisherUrl: "https://solian.app/publishers/{name}",
    tagUrl: "https://solian.app/tags/{slug}",
  },
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    await waitFor(() =>
      expect(sr.querySelector('[part="publisher"]')).not.toBeNull(),
    );

    const originalOpen = window.open;
    const opened: string[] = [];
    window.open = ((url: string) => {
      opened.push(String(url));
      return null;
    }) as unknown as typeof window.open;
    try {
      await step("the author expands `{name}` and opens it", async () => {
        const fired = new Promise<{ target: string; href: string; composed: boolean }>(
          (resolve) => {
            el.addEventListener(
              "post-click",
              (event) => {
                const e = event as CustomEvent<{ target: string; href: string }>;
                resolve({ target: e.detail.target, href: e.detail.href, composed: e.composed });
              },
              { once: true },
            );
          },
        );
        (sr.querySelector('[part="publisher"]') as HTMLElement).click();
        const detail = await fired;
        await expect(detail.target).toBe("publisher");
        await expect(detail.href).toBe("https://solian.app/publishers/alice");
        await expect(detail.composed).toBe(true);
        await expect(opened).toEqual(["https://solian.app/publishers/alice"]);
      });

      await step("a tag expands `{slug}`", async () => {
        const fired = new Promise<string>((resolve) => {
          el.addEventListener(
            "post-click",
            (event) => resolve((event as CustomEvent<{ href: string }>).detail.href),
            { once: true },
          );
        });
        (sr.querySelector('[part="tag"]') as HTMLElement).click();
        await expect(await fired).toBe("https://solian.app/tags/solar");
      });

      await step("preventDefault suppresses the default action", async () => {
        opened.length = 0;
        const cancel = (event: Event) => event.preventDefault();
        el.addEventListener("post-click", cancel);
        try {
          (sr.querySelector('[part="publisher"]') as HTMLElement).click();
          await expect(opened).toEqual([]);
        } finally {
          el.removeEventListener("post-click", cancel);
        }
      });
    } finally {
      window.open = originalOpen;
    }
  },
};

/**
 * A host that already holds the post assigns the `post` property and skips the
 * request entirely.
 */
export const PostProperty: Story = {
  render: () => html`<sk-post id="by-property"></sk-post>`,
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-post") as PostHandle | null;
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");

    await step("no post attribute and no post property → the error state", async () => {
      await waitFor(() =>
        expect(el.getAttribute("data-error")).toContain("Missing required `post` attribute."),
      );
      await expect(el.shadowRoot?.querySelector('[part="error"]')).not.toBeNull();
    });

    await step("assigning the property renders the post with no request", async () => {
      stubState.requests.length = 0;
      el.post = postFixture("post_rich");
      await waitFor(() =>
        expect(el.shadowRoot?.querySelector('[part="content"]')?.querySelector("h1")).not.toBeNull(),
      );
      await expect(el.shadowRoot?.querySelector('[part="publisher"]')?.textContent).toBe("Alice");
      await expect(stubState.requests.length).toBe(0);
      await expect(el.shadowRoot?.querySelector('[part="content"]')?.textContent).toContain(
        "Release notes",
      );
    });
  },
};

/** Missing `post` → inline error state. */
export const MissingPost: Story = {
  args: { post: "" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.getAttribute("data-error")).toContain("Missing required `post` attribute."),
    );
    await expect(el.shadowRoot.querySelector('[part="error"]')).not.toBeNull();
  },
};

/** Attachment clicks bubble as `media-click`, tagged with the post. */
export const MediaClick: Story = {
  args: { post: "post_rich" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-post");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    await waitFor(() =>
      expect(sr.querySelector('[part="media"] .sk-media__item')).not.toBeNull(),
    );

    const fired = new Promise<{ postId: string; index: number; composed: boolean }>(
      (resolve) => {
        el.addEventListener(
          "media-click",
          (event) => {
            const e = event as CustomEvent<{ postId: string; index: number }>;
            resolve({ postId: e.detail.postId, index: e.detail.index, composed: e.composed });
          },
          { once: true },
        );
      },
    );
    (sr.querySelector('[part="media"] .sk-media__item') as HTMLElement).click();
    const detail = await fired;
    await expect(detail.postId).toBe("post_rich");
    await expect(detail.index).toBe(0);
    await expect(detail.composed).toBe(true);
  },
};

/** The element can be registered under a custom tag via `definePost`. */
export const CustomTag: Story = {
  render: (args) => html`
    <sk-demo-post post="${ifDefined(args.post)}"></sk-demo-post>
  `,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-demo-post");
    await waitFor(() =>
      expect(el?.shadowRoot?.querySelector('[part="publisher"]')).not.toBeNull(),
    );
  },
};

/**
 * A real post, straight from `api.solian.app`: `parameters.liveApi` forwards
 * the post request to the live API, so `post` can be any real id (the default
 * is a public one).
 */
export const LivePost: Story = {
  args: { post: "01a11173-2a88-72a4-87cb-546aaddb046d" },
  parameters: { liveApi: true },
  // No play function, and `!test` keeps the Vitest addon from ever fetching
  // the real API from CI.
  tags: ["!test"],
};

/** The helpers the element builds on are exported for hosts too. */
export const ExportedHelpers: Story = {
  render: () => html`<div id="helpers"></div>`,
  play: async ({ canvasElement }) => {
    await expect(formatCount(999)).toBe("999");
    await expect(formatCount(1200)).toBe("1.2K");
    await expect(formatCount(1500000)).toBe("1.5M");
    // Raw HTML in post content is escaped, not rendered.
    const html2 = renderMarkdown("<img src=x onerror=alert(1)> and **bold**");
    await expect(html2).toContain("&lt;img");
    await expect(html2).toContain("<strong>bold</strong>");
    // Non-http(s) link targets degrade to text.
    await expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("href");
    await expect(canvasElement.querySelector("#helpers")).not.toBeNull();
  },
};
