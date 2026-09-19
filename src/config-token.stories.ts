import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { expect, waitFor } from "storybook/test";
import { configure } from "./config";
import { SunkenLandSession, inMemorySessionStorage } from "./session";
import { CONFIGURED_TOKEN, resetStub, stubState } from "../.storybook/fixtures";
import { defineLogin } from "./elements/login";
import { defineReplyComposer } from "./elements/reply-composer";

defineLogin();
defineReplyComposer();

/**
 * `configure({ token })` — hosts that already hold a credential skip the login
 * button entirely: the elements authenticate with that token and render the
 * signed-in state (the account is resolved from the API).
 */

interface ConfigTokenArgs {
  note?: string;
}

const meta: Meta<ConfigTokenArgs> = {
  title: "SDK/Configured token",
  tags: ["autodocs"],
  render: (args) =>
    html`<div>${args.note}</div>
      <sk-login id="login"></sk-login>
      <sk-reply-composer id="composer" post="post_1"></sk-reply-composer>`,
  args: { note: "No sign-in click: the token comes from configure()." },
};

export default meta;

type Story = StoryObj<ConfigTokenArgs>;

/** The widgets come up authenticated without anyone using the login button. */
export const ProvidedToken: Story = {
  render: (args) => {
    const session = new SunkenLandSession({ storage: inMemorySessionStorage() });
    configure({ session, token: CONFIGURED_TOKEN });
    (window as unknown as { __testSession?: SunkenLandSession }).__testSession = session;
    resetStub();
    return html`<div>${args.note}</div>
      <sk-login id="login"></sk-login>
      <sk-reply-composer id="composer" post="post_1"></sk-reply-composer>`;
  },
  play: async ({ canvasElement, step }) => {
    const session = (window as unknown as { __testSession: SunkenLandSession }).__testSession;
    const login = canvasElement.querySelector("#login");
    const composer = canvasElement.querySelector("#composer");
    if (!login?.shadowRoot || !composer?.shadowRoot) throw new Error("elements not upgraded");

    await step("the session adopts the configured token", async () => {
      await waitFor(() => expect(session.isSignedIn).toBe(true));
      expect(await session.getAccessToken()).toBe(CONFIGURED_TOKEN);
      expect(session.user?.id).toBe("acc_me");
      expect(session.externallyProvisioned).toBe(true);
    });

    await step("the widgets render signed-in state with no sign-in click", async () => {
      await waitFor(() =>
        expect(login.shadowRoot?.querySelector(".sk-login__name")?.textContent.trim()).toBe("Me"),
      );
      // Sign out is the host's call when the host owns the credential.
      expect(login.shadowRoot?.querySelector(".sk-login__signout")).toBeNull();
      await waitFor(() =>
        expect(composer.shadowRoot?.querySelector("textarea")).not.toBeNull(),
      );
      // The publisher switcher loaded through the configured token.
      await waitFor(() =>
        expect(
          composer.shadowRoot?.querySelector(".sk-composer__publisher-handle")?.textContent.trim(),
        ).toBe("@me"),
      );
      const publishers = stubState.requests.find(
        (r) => r.path === "/sphere/publishers" && r.query.includes("mine=true"),
      );
      expect(publishers?.auth).toBe(`Bearer ${CONFIGURED_TOKEN}`);
    });

    await step("posting authenticates with the configured token", async () => {
      const sr = composer.shadowRoot;
      if (!sr) throw new Error("composer not upgraded");
      const textarea = sr.querySelector("textarea") as HTMLTextAreaElement;
      const submit = sr.querySelector(".sk-composer__submit") as HTMLButtonElement;
      textarea.value = "Posted with a host-provided token.";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await waitFor(() => expect(submit.disabled).toBe(false));
      submit.click();
      await waitFor(() => expect(textarea.value).toBe(""));

      const post = stubState.requests
        .filter((r) => r.method === "POST" && r.path === "/sphere/posts")
        .at(-1);
      expect(post?.auth).toBe(`Bearer ${CONFIGURED_TOKEN}`);
    });
  },
};

/** A rejected token surfaces as an actionable error, not a silent no-op. */
export const RejectedToken: Story = {
  render: (args) => {
    const session = new SunkenLandSession({ storage: inMemorySessionStorage() });
    configure({ session, token: "at_bogus" });
    (window as unknown as { __testSession?: SunkenLandSession }).__testSession = session;
    resetStub();
    return html`<div>${args.note}</div><sk-login id="login"></sk-login>`;
  },
  play: async ({ canvasElement, step }) => {
    const login = canvasElement.querySelector("#login");
    if (!login?.shadowRoot) throw new Error("element not upgraded");

    await step("the widget reports the rejected token", async () => {
      await waitFor(() =>
        expect(login.shadowRoot?.querySelector(".sk-login__error")?.textContent).toContain(
          "configured access token was rejected",
        ),
      );
      expect(login.getAttribute("data-error")).toContain("rejected");
    });
  },
};
