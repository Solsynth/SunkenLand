import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { expect, waitFor } from "storybook/test";
import { configure } from "../config";
import { SunkenLandSession, inMemorySessionStorage } from "../session";
import { resetStub, stubOidcPopup, stubState } from "../../.storybook/fixtures";

/**
 * `sk-reply-composer` — reply box for a parent post.
 *
 * Guest state shows a "Sign in with Solarpass" button; signed in, the form
 * posts the reply as the account's publisher. Stories run on isolated
 * in-memory sessions so the OAuth exchange can be driven programmatically.
 * The ReplyFlow story mounts a real `sk-replies-list` next to the composer to
 * prove the cross-element refresh (`sunkenland:reply-posted` → re-fetch).
 */

interface ComposerArgs {
  post?: string;
  pub?: string;
  placeholder?: string;
  submitLabel?: string;
  maxLength?: number;
  clientId?: string;
  mode?: "popup" | "redirect";
  css?: string;
}

const render = (args: ComposerArgs) => html`
  <sk-reply-composer
    post="${ifDefined(args.post)}"
    pub="${ifDefined(args.pub)}"
    placeholder="${ifDefined(args.placeholder)}"
    submit-label="${ifDefined(args.submitLabel)}"
    max-length="${ifDefined(args.maxLength)}"
    client-id="${ifDefined(args.clientId)}"
    mode="${ifDefined(args.mode)}"
    css="${ifDefined(args.css)}"
  ></sk-reply-composer>
`;

const meta: Meta<ComposerArgs> = {
  title: "Elements/sk-reply-composer",
  tags: ["autodocs"],
  render,
  argTypes: {
    post: { control: "text", description: "Parent post id (required to submit)." },
    pub: { control: "text", description: "Publisher to post as (default: the account's first publisher)." },
    placeholder: { control: "text" },
    submitLabel: { control: "text" },
    maxLength: { control: { type: "number", min: 1 } },
    clientId: {
      control: "text",
      description: "Registered OIDC client id (falls back to `configure({ oidc })`).",
    },
    mode: {
      control: "inline-radio",
      options: ["popup", "redirect"],
      description: "`popup` keeps the host page; `redirect` navigates it.",
    },
    css: {
      control: "text",
      description: "Per-element stylesheet override (`css=\"\"` disables styling).",
    },
  },
  args: { post: "post_1", placeholder: "Write a reply…" },
};

export default meta;

type Story = StoryObj<ComposerArgs>;

function freshSession(): SunkenLandSession {
  const s = new SunkenLandSession({ storage: inMemorySessionStorage() });
  configure({ session: s, oidc: { clientId: "sunkenland-widget" } });
  (window as unknown as { __testSession?: SunkenLandSession }).__testSession = s;
  resetStub();
  return s;
}

/** Click the element's Solarpass button and complete the stubbed popup. */
async function signInWithPopup(composer: Element): Promise<void> {
  const popup = stubOidcPopup();
  try {
    const button = composer.shadowRoot?.querySelector(
      ".sk-composer__solarpass",
    ) as HTMLButtonElement;
    button.click();
    await waitFor(() => expect(popup.url).not.toBeNull());
    popup.relay();
    await waitFor(() =>
      expect(composer.shadowRoot?.querySelector("textarea")).not.toBeNull(),
    );
  } finally {
    popup.restore();
  }
}

function typeText(textarea: HTMLTextAreaElement, text: string): void {
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Signed out: sign-in prompt + branded button, no composer form. */
export const SignedOut: Story = {};

/** Sign in → type → submit → reply posted, event fired, list refreshed. */
export const ReplyFlow: Story = {
  render: (args) => {
    freshSession();
    return html`
      ${render(args)}
      <br />
      <sk-replies-list post="${ifDefined(args.post ?? "post_1")}"></sk-replies-list>
    `;
  },
  play: async ({ canvasElement, step }) => {
    const composer = canvasElement.querySelector("sk-reply-composer");
    const list = canvasElement.querySelector("sk-replies-list");
    if (!composer || !composer.shadowRoot || !list || !list.shadowRoot) {
      throw new Error("elements not upgraded");
    }
    const csr = composer.shadowRoot;
    const lsr = list.shadowRoot;

    await step("signed in after code exchange; publisher switcher loads", async () => {
      await signInWithPopup(composer);
      await waitFor(() =>
        expect(csr.querySelector(".sk-composer__publisher-name")?.textContent.trim()).toBe("Me"),
      );
      expect(csr.querySelector(".sk-composer__publisher-handle")?.textContent.trim()).toBe("@me");
    });

    await step("submit posts a reply and clears the textarea", async () => {
      const posted: unknown[] = [];
      composer.addEventListener("reply-posted", (e) => posted.push((e as CustomEvent).detail));

      const textarea = csr.querySelector("textarea") as HTMLTextAreaElement;
      const submit = csr.querySelector(".sk-composer__submit") as HTMLButtonElement;
      typeText(textarea, "A new reply from the widget.");
      await waitFor(() => expect(textarea.value).toBe("A new reply from the widget."));
      await waitFor(() => expect(submit.disabled).toBe(false));
      submit.click();

      await waitFor(() => expect(textarea.value).toBe(""));
      await waitFor(() => expect(posted.length).toBe(1));
      const detail = posted[0] as { postId: string; post: { id: string } };
      expect(detail.postId).toBe("post_1");
      expect(detail.post.id).toBe("r_new");
    });

    await step("the wire POST carried the reply content + parent id", async () => {
      const post = stubState.requests.find(
        (r) => r.method === "POST" && r.path === "/sphere/posts",
      );
      expect(post?.body).toMatchObject({
        content: "A new reply from the widget.",
        replied_post_id: "post_1",
      });
    });

    await step("the sibling replies list re-fetched and grew", async () => {
      await waitFor(() => expect(lsr.querySelectorAll(".sk-reply").length).toBe(6));
    });
  },
};

/** The first write 401s → the session refreshes → the retry succeeds. */
export const RefreshOn401: Story = {
  render: (args) => {
    freshSession();
    stubState.failFirstPost = true;
    return render(args);
  },
  play: async ({ canvasElement, step }) => {
    const composer = canvasElement.querySelector("sk-reply-composer");
    if (!composer || !composer.shadowRoot) throw new Error("element not upgraded");
    const sr = composer.shadowRoot;

    await step("submit survives a 401 by refreshing the token", async () => {
      await signInWithPopup(composer);
      await waitFor(() =>
        expect(sr.querySelector(".sk-composer__publisher-name")?.textContent.trim()).toBe("Me"),
      );

      const textarea = sr.querySelector("textarea") as HTMLTextAreaElement;
      const submit = sr.querySelector(".sk-composer__submit") as HTMLButtonElement;
      typeText(textarea, "Retry me.");
      await waitFor(() => expect(submit.disabled).toBe(false));
      submit.click();

      await waitFor(() => expect(textarea.value).toBe(""));
      const posts = stubState.requests.filter(
        (r) => r.method === "POST" && r.path === "/sphere/posts",
      );
      expect(posts.length).toBe(2);
      expect(posts[0]?.auth).toBe("Bearer oidc_at");
      expect(posts[1]?.auth).toBe("Bearer oidc_at_2");
      expect(stubState.oidcExchanges).toBe(1);
      expect(stubState.oidcRefreshes).toBe(1); // initial exchange + refresh
    });
  },
};

/** Guest button label/icon + `part` hooks are host-customizable. */
export const Customized: Story = {
  name: "Customized (label / icon / parts)",
  render: () => {
    freshSession();
    return html`
      <sk-reply-composer
        post="post_1"
        label="Continue with Solar"
        icon=""
        placeholder="Say something…"
      ></sk-reply-composer>
    `;
  },
  play: async ({ canvasElement, step }) => {
    const composer = canvasElement.querySelector("sk-reply-composer");
    if (!composer || !composer.shadowRoot) throw new Error("element not upgraded");
    const sr = composer.shadowRoot;

    await step("guest state honours label / icon=\"\"", async () => {
      await waitFor(() =>
        expect(sr.querySelector(".sk-composer__label")?.textContent.trim()).toBe("Continue with Solar"),
      );
      expect(sr.querySelector(".sk-composer__logo")).toBeNull();
    });

    await step("internal nodes expose parts for ::part() styling", async () => {
      expect(sr.querySelector(".sk-composer__solarpass")?.getAttribute("part")).toBe("button");
      expect(sr.querySelector(".sk-composer__hint")?.getAttribute("part")).toBe("hint");
      expect(sr.querySelector(".sk-composer__guest")?.getAttribute("part")).toBe("guest");
    });

    await step("signed-in form exposes parts too", async () => {
      await signInWithPopup(composer);
      await waitFor(() => expect(sr.querySelector("textarea")).not.toBeNull());
      expect(sr.querySelector("textarea")?.getAttribute("part")).toBe("input");
      expect(sr.querySelector(".sk-composer__submit")?.getAttribute("part")).toBe("submit");
      expect(sr.querySelector("form")?.getAttribute("part")).toBe("form");
    });
  },
};

/** The user can switch publishers (like FloatLand's composer). */
export const SwitchPublisher: Story = {
  render: (args) => {
    freshSession();
    return render(args);
  },
  play: async ({ canvasElement, step }) => {
    const composer = canvasElement.querySelector("sk-reply-composer");
    if (!composer || !composer.shadowRoot) throw new Error("element not upgraded");
    const sr = composer.shadowRoot;

    await step("switcher lists the account's publishers, first selected", async () => {
      await signInWithPopup(composer);
      await waitFor(() =>
        expect(sr.querySelector(".sk-composer__publisher-name")?.textContent.trim()).toBe("Me"),
      );

      (sr.querySelector(".sk-composer__publisher-toggle") as HTMLButtonElement).click();
      await waitFor(() => expect(sr.querySelectorAll(".sk-composer__publisher-option").length).toBe(2));
      const options = [...sr.querySelectorAll(".sk-composer__publisher-option")];
      expect(options[0]?.textContent).toContain("@me");
      expect(options[1]?.textContent).toContain("@me-alt");
      expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    });

    await step("choosing another publisher retargets the reply", async () => {
      const options = [...sr.querySelectorAll(".sk-composer__publisher-option")];
      (options[1] as HTMLButtonElement).click();
      await waitFor(() =>
        expect(sr.querySelector(".sk-composer__publisher-name")?.textContent.trim()).toBe("Me (alt)"),
      );
      expect(sr.querySelector(".sk-composer__publisher-handle")?.textContent.trim()).toBe("@me-alt");
      // The picker closes after choosing.
      expect(sr.querySelector(".sk-composer__publisher-list")).toBeNull();

      const textarea = sr.querySelector("textarea") as HTMLTextAreaElement;
      const submit = sr.querySelector(".sk-composer__submit") as HTMLButtonElement;
      typeText(textarea, "Posting as the alt publisher.");
      await waitFor(() => expect(submit.disabled).toBe(false));
      submit.click();

      await waitFor(() => expect(textarea.value).toBe(""));
      const post = stubState.requests
        .filter((r) => r.method === "POST" && r.path === "/sphere/posts")
        .at(-1);
      // `pub` selects the publisher on the wire.
      expect(post?.query).toContain("pub=me-alt");
    });
  },
};

/** A pinned `pub` attribute fixes the publisher and hides the switcher. */
export const PinnedPublisher: Story = {
  render: () => {
    freshSession();
    return html`<sk-reply-composer post="post_1" pub="me-alt"></sk-reply-composer>`;
  },
  play: async ({ canvasElement, step }) => {
    const composer = canvasElement.querySelector("sk-reply-composer");
    if (!composer || !composer.shadowRoot) throw new Error("element not upgraded");
    const sr = composer.shadowRoot;

    await step("the pinned publisher is selected and not switchable", async () => {
      await signInWithPopup(composer);
      await waitFor(() =>
        expect(sr.querySelector(".sk-composer__publisher-handle")?.textContent.trim()).toBe("@me-alt"),
      );
      const toggle = sr.querySelector(".sk-composer__publisher-toggle") as HTMLButtonElement;
      expect(toggle.disabled).toBe(true);
      toggle.click();
      expect(sr.querySelector(".sk-composer__publisher-list")).toBeNull();
    });
  },
};

/**
 * A long publisher list must escape the composer's own box. The card surface
 * (`:host`) may not clip its own dropdown — the option below the card's edge
 * has to stay hit-testable.
 */
export const LongPublisherList: Story = {
  render: (args) => {
    freshSession();
    stubState.manyPublishers = true;
    return render(args);
  },
  play: async ({ canvasElement, step }) => {
    const host = canvasElement.querySelector<HTMLElement>("sk-reply-composer");
    const sr = host?.shadowRoot;
    if (!host || !sr) throw new Error("element not upgraded");

    await step("the dropdown is not clipped by the composer card", async () => {
      await signInWithPopup(host);
      (sr.querySelector(".sk-composer__publisher-toggle") as HTMLButtonElement).click();
      await waitFor(() =>
        expect(sr.querySelectorAll(".sk-composer__publisher-option").length).toBe(10),
      );

      // The list hangs below the card …
      host.scrollIntoView({ block: "center" });
      const hostRect = host.getBoundingClientRect();
      const menu = sr.querySelector(".sk-composer__publisher-list");
      if (!menu) throw new Error("dropdown not rendered");
      const menuRect = menu.getBoundingClientRect();
      expect(menuRect.bottom).toBeGreaterThan(hostRect.bottom);
      expect(menuRect.bottom).toBeLessThan(window.innerHeight);

      // … and its lower edge must still be hit-testable: with the card
      // clipping (`overflow: hidden`), nothing is painted there.
      const hit = sr.elementFromPoint(
        menuRect.left + menuRect.width / 2,
        menuRect.bottom - 4,
      );
      expect(hit?.closest(".sk-composer__publisher-list")).toBeTruthy();
    });
  },
};

/** Submitting without a `post` attribute surfaces a clear error. */
export const MissingPost: Story = {
  render: () => {
    freshSession();
    return html`<sk-reply-composer></sk-reply-composer>`;
  },
  play: async ({ canvasElement, step }) => {
    const composer = canvasElement.querySelector("sk-reply-composer");
    if (!composer || !composer.shadowRoot) throw new Error("element not upgraded");
    const sr = composer.shadowRoot;

    await step("missing post attribute → inline error on submit", async () => {
      await signInWithPopup(composer);
      await waitFor(() => expect(sr.querySelector("textarea")).not.toBeNull());

      const textarea = sr.querySelector("textarea") as HTMLTextAreaElement;
      const submit = sr.querySelector(".sk-composer__submit") as HTMLButtonElement;
      typeText(textarea, "orphan");
      await waitFor(() => expect(submit.disabled).toBe(false));
      submit.click();

      await waitFor(() =>
        expect(sr.querySelector(".sk-composer__error")?.textContent.trim()).toBe(
          "Missing required `post` attribute.",
        ),
      );
      await waitFor(() =>
        expect(composer.getAttribute("data-error")).toContain("Missing required `post`"),
      );
    });
  },
};
