import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { expect, waitFor } from "storybook/test";
import { configure } from "../config";
import { SunkenLandSession, inMemorySessionStorage } from "../session";
import { resetStub, stubOidcPopup, stubState } from "../../.storybook/fixtures";
import { defineReactionList } from "./reaction-list";

defineReactionList();

/**
 * `sk-reaction-list` — reaction bar for a post (FloatLand's
 * `PostReactionList`): a chip per reaction plus the "React" picker.
 *
 * The element reads the post itself (`GET /sphere/posts/{post}`), so the stubs
 * thread the reaction counts through that read — and `reactions_made` only
 * when the request carries a token, exactly like the API.
 */

interface ReactionListArgs {
  post?: string;
  maxVisible?: number;
  picker?: boolean;
  reactLabel?: string;
  stickerUrl?: string;
  clientId?: string;
}

const render = (args: ReactionListArgs) => html`
  <sk-reaction-list
    post="${ifDefined(args.post)}"
    max-visible="${ifDefined(args.maxVisible)}"
    picker="${ifDefined(args.picker)}"
    react-label="${ifDefined(args.reactLabel)}"
    sticker-url="${ifDefined(args.stickerUrl)}"
    client-id="${ifDefined(args.clientId)}"
  ></sk-reaction-list>
`;

const meta: Meta<ReactionListArgs> = {
  title: "Elements/sk-reaction-list",
  tags: ["autodocs"],
  render,
  args: { post: "post_1" },
  argTypes: {
    post: { control: "text", description: "Post id (required)." },
    maxVisible: {
      control: { type: "number", min: 1 },
      description: "Chips shown before the `+N` toggle (default 5).",
    },
    picker: {
      control: "boolean",
      description: "Show the “React” picker (default true).",
    },
    reactLabel: { control: "text", description: "Picker button text." },
    stickerUrl: {
      control: "text",
      description: "Sticker image template, `{symbol}` substituted.",
    },
    clientId: {
      control: "text",
      description: "OIDC client id used when a guest reacts.",
    },
  },
};

export default meta;

type Story = StoryObj<ReactionListArgs>;

/** A page with an isolated session + a clean stub. */
function freshSession(): SunkenLandSession {
  const session = new SunkenLandSession({ storage: inMemorySessionStorage() });
  configure({ session, oidc: { clientId: "sunkenland-widget" } });
  resetStub();
  return session;
}

function element(canvasElement: HTMLElement): { host: HTMLElement; sr: ShadowRoot } {
  const host = canvasElement.querySelector<HTMLElement>("sk-reaction-list");
  if (!host?.shadowRoot) throw new Error("element not upgraded");
  return { host, sr: host.shadowRoot };
}

const chipCounts = (sr: ShadowRoot): string[] =>
  [...sr.querySelectorAll(".sk-reactions__chip")].map(
    (chip) => chip.querySelector(".sk-reactions__count")?.textContent?.trim() ?? "",
  );

/** Drive the real OIDC popup flow against the stubbed provider. */
async function signIn(session: SunkenLandSession): Promise<void> {
  const popup = stubOidcPopup();
  try {
    const pending = session.signInWithOidc();
    await waitFor(() => expect(popup.url).not.toBeNull());
    popup.relay();
    await pending;
  } finally {
    popup.restore();
  }
}

/** Counts render for everyone; the `+N` toggle reveals the overflow. */
export const Counts: Story = {
  render: (args) => {
    freshSession();
    return render(args);
  },
  play: async ({ canvasElement, step }) => {
    const { sr } = element(canvasElement);

    await step("chips render the post's reaction counts", async () => {
      await waitFor(() =>
        expect(sr.querySelectorAll(".sk-reactions__chip").length).toBe(5),
      );
      expect(chipCounts(sr)).toEqual(["3", "1", "7", "2", "1"]);
      // Stickers come from `configure({ stickerUrl })` (the shipped set).
      const first = sr.querySelector(".sk-reactions__chip");
      expect(first?.getAttribute("data-symbol")).toBe("thumb_up");
      expect(first?.querySelector<HTMLImageElement>("img")?.getAttribute("src")).toBe(
        "/stickers/thumb_up.webp",
      );
      expect(first?.getAttribute("title")).toContain("Like");
    });

    await step("the +N chip reveals the hidden reactions", async () => {
      const more = sr.querySelector(".sk-reactions__more") as HTMLButtonElement;
      expect(more.textContent?.trim()).toBe("+1");
      more.click();
      await waitFor(() =>
        expect(sr.querySelectorAll(".sk-reactions__chip").length).toBe(6),
      );
      more.click();
      await waitFor(() =>
        expect(sr.querySelectorAll(".sk-reactions__chip").length).toBe(5),
      );
    });

    await step("a signed-out reader sees counts only", async () => {
      expect(sr.querySelector("[data-reacted]")).toBeNull();
      const read = stubState.requests.find((r) => r.path === "/sphere/posts/post_1");
      // The read is public: no Authorization header when nobody is signed in.
      expect(read?.auth ?? null).toBeNull();
    });
  },
};

/** Signed in, the visitor's own reactions are highlighted and togglable. */
export const SignedIn: Story = {
  render: (args) => {
    (window as unknown as { __testSession?: SunkenLandSession }).__testSession =
      freshSession();
    return render(args);
  },
  play: async ({ canvasElement, step }) => {
    const session = (window as unknown as { __testSession: SunkenLandSession })
      .__testSession;
    const { host, sr } = element(canvasElement);
    const events: CustomEvent[] = [];
    host.addEventListener("reaction-added", (event) =>
      events.push(event as CustomEvent),
    );
    host.addEventListener("reaction-removed", (event) =>
      events.push(event as CustomEvent),
    );

    await step("signing in marks the reactions the visitor already made", async () => {
      await signIn(session);
      await waitFor(() => expect(sr.querySelectorAll("[data-reacted]").length).toBe(1));
      const mine = sr.querySelector('[data-symbol="heart"]');
      expect(mine?.querySelector(".sk-reactions__count")?.textContent?.trim()).toBe("1");
      expect(mine?.getAttribute("data-reacted")).toBe("true");
      expect(mine?.getAttribute("aria-pressed")).toBe("true");
      const read = stubState.requests
        .filter((r) => r.path === "/sphere/posts/post_1")
        .at(-1);
      expect(read?.auth).toBe("Bearer oidc_at");
    });

    await step("the picker adds a reaction optimistically", async () => {
      (sr.querySelector(".sk-reactions__trigger") as HTMLButtonElement).click();
      await waitFor(() =>
        expect(sr.querySelectorAll(".sk-reactions__option").length).toBe(15),
      );
      const heart = sr.querySelector<HTMLElement>(
        '.sk-reactions__option[aria-label="Love"]',
      );
      expect(heart?.getAttribute("aria-checked")).toBe("true");
      expect(heart?.classList.contains("sk-reactions__option--mine")).toBe(true);

      (sr.querySelector('.sk-reactions__option[aria-label="Like"]') as HTMLButtonElement)
        .click();
      // Optimistic: the count moves before the response is awaited.
      await waitFor(() => expect(chipCounts(sr)[0]).toBe("4"));
      expect(sr.querySelector(".sk-reactions__menu")).toBeNull();

      await waitFor(() => {
        const post = stubState.requests.find(
          (r) => r.method === "POST" && r.path === "/sphere/posts/post_1/reactions",
        );
        expect(post?.auth).toBe("Bearer oidc_at");
        // camelCase payload, snake_case on the wire, canonical attitude.
        expect(post?.body).toEqual({ symbol: "thumb_up", attitude: 0 });
      });
      const chip = sr.querySelector('[data-symbol="thumb_up"]');
      expect(chip?.getAttribute("data-reacted")).toBe("true");
      expect(events.at(-1)?.type).toBe("reaction-added");
      expect(events.at(-1)?.detail).toEqual({
        postId: "post_1",
        symbol: "thumb_up",
        attitude: 0,
        count: 4,
      });
    });

    await step("clicking a chip you own takes the reaction back", async () => {
      const heart = sr.querySelector<HTMLButtonElement>('[data-symbol="heart"]');
      heart?.click();
      // Count reaches zero → the chip goes away entirely (FloatLand behavior).
      await waitFor(() => expect(chipCounts(sr)).toEqual(["4", "7", "2", "1", "1"]));
      // Only the reaction added in the previous step is still mine.
      await waitFor(() =>
        expect(sr.querySelectorAll("[data-reacted]").length).toBe(1),
      );

      await waitFor(() => {
        const removed = stubState.requests.find(
          (r) => r.method === "DELETE" && r.path === "/sphere/posts/post_1/reactions/heart",
        );
        expect(removed?.auth).toBe("Bearer oidc_at");
      });
      expect(events.at(-1)?.type).toBe("reaction-removed");
      expect(events.at(-1)?.detail).toEqual({
        postId: "post_1",
        symbol: "heart",
        attitude: 0,
        count: 0,
      });
    });
  },
};

/**
 * Presets are injected per element, but hosts configure all of them at once
 * (`configure({ css: [...] })`) — so each preset scopes its `:host` rules to
 * its own element. Without that, `sk-replies-list`'s `overflow: hidden`
 * clipped this element's picker (which opens above the row).
 */
export const PresetScoping: Story = {
  render: () => {
    freshSession();
    return html`
      <sk-replies-list post="post_1" take="2"></sk-replies-list>
      <sk-reaction-list post="post_1"></sk-reaction-list>
    `;
  },
  play: async ({ canvasElement, step }) => {
    const reactions = canvasElement.querySelector<HTMLElement>("sk-reaction-list");
    const replies = canvasElement.querySelector<HTMLElement>("sk-replies-list");
    if (!reactions || !replies) throw new Error("elements not upgraded");

    await step("the reaction element is not clipped by the reply preset", async () => {
      const sr = reactions.shadowRoot;
      if (!sr) throw new Error("element not upgraded");
      await waitFor(() => expect(reactions.classList.contains("sk-reactions")).toBe(true));
      // Wait for the stylesheet itself, then assert what it must not do.
      await waitFor(() =>
        expect(getComputedStyle(reactions).fontFamily).toContain("Nunito"),
      );

      // The picker opens above the row, outside the host's box: it must still
      // be hit-testable there (a clipped host paints nothing at that point).
      // The story page is short, so cap the menu (a documented knob) to keep
      // the fixture inside the viewport.
      reactions.style.setProperty("--sk-menu-max-height", "9rem");
      reactions.scrollIntoView({ block: "center" });
      (sr.querySelector(".sk-reactions__trigger") as HTMLButtonElement).click();
      await waitFor(() =>
        expect(sr.querySelectorAll(".sk-reactions__option").length).toBe(15),
      );
      const menu = sr.querySelector(".sk-reactions__menu");
      const first = sr.querySelector<HTMLElement>(".sk-reactions__option");
      if (!menu || !first) throw new Error("menu not rendered");
      const menuRect = menu.getBoundingClientRect();
      const hostRect = reactions.getBoundingClientRect();
      expect(menuRect.top).toBeLessThan(hostRect.top);
      expect(menuRect.top).toBeGreaterThan(0);
      const firstRect = first.getBoundingClientRect();
      const hit = sr.elementFromPoint(
        firstRect.left + firstRect.width / 2,
        firstRect.top + firstRect.height / 2,
      );
      expect(hit?.closest(".sk-reactions__option")).toBeTruthy();
    });

    await step("the reply list keeps its own preset", async () => {
      await waitFor(() => expect(replies.classList.contains("sk-replies")).toBe(true));
      await waitFor(() => expect(getComputedStyle(replies).overflow).toBe("hidden"));
    });
  },
};

/** `sticker-url` swaps the emoji for images, `{symbol}` substituted. */
export const StickerUrl: Story = {
  render: () => {
    freshSession();
    return render({
      post: "post_1",
      stickerUrl: "https://cdn.test/stickers/{symbol}.webp",
    });
  },
  play: async ({ canvasElement, step }) => {
    const { sr } = element(canvasElement);

    await step("chips render stickers resolved from the template", async () => {
      await waitFor(() =>
        expect(sr.querySelectorAll(".sk-reactions__chip .sk-reactions__sticker").length).toBe(5),
      );
      const img = sr.querySelector<HTMLImageElement>(".sk-reactions__chip img");
      // Symbols are normalized to snake_case before substitution.
      expect(img?.getAttribute("src")).toBe("https://cdn.test/stickers/thumb_up.webp");
      expect(img?.getAttribute("alt")).toBe("Like");
      expect(sr.querySelector(".sk-reactions__chip .sk-reactions__emoji")).toBeNull();
    });
  },
};

/** `sticker-url=""` (or no configured template) renders emoji instead. */
export const EmojiFallback: Story = {
  render: () => {
    freshSession();
    return html`<sk-reaction-list post="post_1" sticker-url=""></sk-reaction-list>`;
  },
  play: async ({ canvasElement, step }) => {
    const { sr } = element(canvasElement);

    await step("chips fall back to emoji", async () => {
      await waitFor(() =>
        expect(sr.querySelectorAll(".sk-reactions__chip").length).toBe(5),
      );
      expect(sr.querySelector(".sk-reactions__chip img")).toBeNull();
      const first = sr.querySelector('[data-symbol="thumb_up"]');
      expect(first?.querySelector(".sk-reactions__emoji")?.textContent).toBe("👍");
    });
  },
};

/** A rejected reaction rolls the optimistic update back and reports it. */
export const RejectedReaction: Story = {
  render: (args) => {
    (window as unknown as { __testSession?: SunkenLandSession }).__testSession =
      freshSession();
    return render(args);
  },
  play: async ({ canvasElement, step }) => {
    const session = (window as unknown as { __testSession: SunkenLandSession })
      .__testSession;
    const { host, sr } = element(canvasElement);

    await step("the chip reverts and the error surfaces", async () => {
      await signIn(session);
      // `reactions_made` only renders after the authenticated re-read lands.
      await waitFor(() =>
        expect(sr.querySelectorAll("[data-reacted]").length).toBe(1),
      );
      stubState.failReactions = true;

      const chip = sr.querySelectorAll<HTMLButtonElement>(".sk-reactions__chip")[0];
      chip?.click();
      await waitFor(() =>
        expect(sr.querySelector(".sk-reactions__error")?.textContent).toContain(
          "reaction rejected",
        ),
      );
      expect(chipCounts(sr)[0]).toBe("3");
      expect(chip?.getAttribute("data-reacted")).toBeNull();
      expect(host.getAttribute("data-error")).toBe("reaction rejected");
    });
  },
};

/** Reacting while signed out starts the Solarpass sign-in flow. */
export const GuestReaction: Story = {
  render: (args) => {
    (window as unknown as { __testSession?: SunkenLandSession }).__testSession =
      freshSession();
    return render(args);
  },
  play: async ({ canvasElement, step }) => {
    const session = (window as unknown as { __testSession: SunkenLandSession })
      .__testSession;
    const { sr } = element(canvasElement);

    await step("a guest chip click opens the provider popup", async () => {
      await waitFor(() =>
        expect(sr.querySelectorAll(".sk-reactions__chip").length).toBe(5),
      );
      const popup = stubOidcPopup();
      try {
        sr.querySelectorAll<HTMLButtonElement>(".sk-reactions__chip")[0]?.click();
        await waitFor(() => expect(popup.url).not.toBeNull());
        expect(popup.url).toContain("/auth/authorize");
        expect(session.isSignedIn).toBe(false);

        popup.relay();
        await waitFor(() => expect(session.isSignedIn).toBe(true));
      } finally {
        popup.restore();
      }
    });

    await step("the post is re-read with the token, marking my reactions", async () => {
      await waitFor(() =>
        expect(sr.querySelectorAll("[data-reacted]").length).toBe(1),
      );
      const read = stubState.requests
        .filter((r) => r.path === "/sphere/posts/post_1")
        .at(-1);
      expect(read?.auth).toBe("Bearer oidc_at");
    });
  },
};

/** `picker="false"` renders a read-only summary (chips only). */
export const ChipsOnly: Story = {
  render: () => {
    freshSession();
    return render({ post: "post_1", picker: false });
  },
  play: async ({ canvasElement, step }) => {
    const { sr } = element(canvasElement);

    await step("no picker, and an empty state when there is nothing to show", async () => {
      await waitFor(() =>
        expect(sr.querySelectorAll(".sk-reactions__chip").length).toBe(5),
      );
      expect(sr.querySelector(".sk-reactions__trigger")).toBeNull();
      expect(sr.querySelector(".sk-reactions__more")).not.toBeNull();
    });
  },
};

/** `picker="false"` on a post nobody reacted to shows the empty state. */
export const Empty: Story = {
  render: () => {
    freshSession();
    return render({ post: "post_quiet", picker: false });
  },
  play: async ({ canvasElement, step }) => {
    const { sr } = element(canvasElement);

    await step("the empty slot renders", async () => {
      await waitFor(() =>
        expect(sr.querySelector(".sk-reactions__empty")?.textContent?.trim()).toBe(
          "No reactions yet",
        ),
      );
    });
  },
};
