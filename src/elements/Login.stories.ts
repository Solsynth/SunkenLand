import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { expect, waitFor } from "storybook/test";
import { configure } from "../config";
import { SunkenLandSession, inMemorySessionStorage } from "../session";
import { resetStub, stubOidcPopup, stubState } from "../../.storybook/fixtures";

/**
 * `sk-login` — Solarpass sign-in widget.
 *
 * The button is a real OpenID Connect client: clicking it discovers the
 * issuer, generates PKCE, and opens the provider in a popup. Stories replace
 * the popup with a stub that relays the provider's `{code, state}` back, so
 * everything after the provider page — PKCE exchange, session, rendering — runs
 * for real. Each story uses an isolated in-memory session.
 */

interface LoginArgs {
  clientId?: string;
  issuer?: string;
  redirectUri?: string;
  scopes?: string;
  mode?: "popup" | "redirect";
  css?: string;
}

const render = (args: LoginArgs) => html`
  <sk-login
    client-id="${ifDefined(args.clientId)}"
    issuer="${ifDefined(args.issuer)}"
    redirect-uri="${ifDefined(args.redirectUri)}"
    scopes="${ifDefined(args.scopes)}"
    mode="${ifDefined(args.mode)}"
    css="${ifDefined(args.css)}"
  ></sk-login>
`;

/**
 * Render on an isolated session so a story's assertions never depend on what an
 * earlier story left in the shared configuration.
 */
function renderWithFreshSession(args: LoginArgs) {
  configure({
    session: new SunkenLandSession({ storage: inMemorySessionStorage() }),
    oidc: { clientId: "sunkenland-widget" },
  });
  resetStub();
  return render(args);
}

const meta: Meta<LoginArgs> = {
  title: "Elements/sk-login",
  tags: ["autodocs"],
  render,
  argTypes: {
    clientId: {
      control: "text",
      description: "Registered OIDC client id (falls back to `configure({ oidc })`).",
    },
    issuer: { control: "text", description: "Issuer base URL (default `https://api.solian.app`)." },
    redirectUri: { control: "text", description: "Registered redirect URI (default: this page)." },
    scopes: { control: "text", description: "Space/comma separated (default `openid profile email`)." },
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
  args: { clientId: "sunkenland-widget", mode: "popup" },
};

export default meta;

type Story = StoryObj<LoginArgs>;

/** Signed-out default: the branded button, no user row, no error. */
export const SignedOut: Story = { render: (args) => renderWithFreshSession(args) };

/** Clicking the button runs the Solarpass OIDC flow (popup + PKCE). */
export const SignInFlow: Story = {
  render: (args) => {
    const s = new SunkenLandSession({ storage: inMemorySessionStorage() });
    configure({ session: s, oidc: { clientId: "sunkenland-widget" } });
    (window as unknown as { __testSession?: SunkenLandSession }).__testSession = s;
    resetStub();
    return render(args);
  },
  play: async ({ canvasElement, step }) => {
    const session = (window as unknown as { __testSession: SunkenLandSession }).__testSession;
    const el = canvasElement.querySelector("sk-login");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    const events: string[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).type);
    el.addEventListener("sign-in", listener);
    el.addEventListener("sign-out", listener);
    const popup = stubOidcPopup();

    try {
      await step("guest state shows the branded button", async () => {
        const button = sr.querySelector(".sk-login__solarpass") as HTMLButtonElement;
        await waitFor(() => expect(button.textContent).toContain("Sign in with Solarpass"));
        expect(sr.querySelector(".sk-login__user")).toBeNull();
      });

      await step("the button starts an OIDC authorization request", async () => {
        (sr.querySelector(".sk-login__solarpass") as HTMLButtonElement).click();
        await waitFor(() => expect(popup.url).not.toBeNull());
        const url = new URL(popup.url as string);
        expect(url.origin + url.pathname).toBe("https://id.solian.app/auth/authorize");
        expect(url.searchParams.get("response_type")).toBe("code");
        expect(url.searchParams.get("client_id")).toBe("sunkenland-widget");
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("code_challenge")).toBeTruthy();
      });

      await step("the provider's code exchange signs the widget in", async () => {
        popup.relay({ code: "login-story-code" });
        await waitFor(() => expect(sr.querySelector(".sk-login__name")?.textContent).toBe("Me"));
        expect(sr.querySelector(".sk-login__signout")).not.toBeNull();
        // OIDC endpoints were used, not the legacy backend exchange.
        const token = stubState.requests.find(
          (r) => r.method === "POST" && r.path === "/stargate/auth/open/token",
        );
        expect((token?.body as Record<string, string>)?.code).toBe("login-story-code");
        // The OIDC access token then resolves the account through the API.
        const account = stubState.requests.find((r) => r.path === "/stargate/accounts/me");
        expect(account?.auth).toBe("Bearer oidc_at");
      });

      await step("the element broadcasts sign-in, then sign-out on click", async () => {
        await waitFor(() => expect(events).toContain("sign-in"));
        (sr.querySelector(".sk-login__signout") as HTMLButtonElement).click();
        await waitFor(() => expect(sr.querySelector(".sk-login__solarpass")).not.toBeNull());
        await waitFor(() => expect(events).toContain("sign-out"));
        expect(session.isSignedIn).toBe(false);
      });
    } finally {
      popup.restore();
      el.removeEventListener("sign-in", listener);
      el.removeEventListener("sign-out", listener);
    }
  },
};

/** Label, icon and `part` hooks are host-customizable. */
export const Customized: Story = {
  name: "Customized (label / icon / parts)",
  render: () => {
    renderWithFreshSession({});
    return html`
    <sk-login id="default"></sk-login>
    <sk-login id="relabelled" label="Continue with Solar"></sk-login>
    <sk-login
      id="no-icon"
      icon=""
      label="Sign in"
    ></sk-login>
    <sk-login
      id="custom-icon"
      icon="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%2210%22%20fill%3D%22%23d946ef%22%2F%3E%3C%2Fsvg%3E"
      label="Sign in with Acme"
    ></sk-login>
    `;
  },
  play: async ({ canvasElement, step }) => {
    const shadowOf = (id: string) => {
      const el = canvasElement.querySelector(id);
      if (!el || !el.shadowRoot) throw new Error(`${id} not upgraded`);
      return el.shadowRoot;
    };

    await step("built-in Solar mark renders by default", async () => {
      const sr = shadowOf("#default");
      await waitFor(() => expect(sr.querySelector(".sk-login__logo svg")).not.toBeNull());
      // The mark is the Solian artwork (192-unit viewBox), tinted by currentColor.
      expect(sr.querySelector(".sk-login__logo svg")?.getAttribute("viewBox")).toBe("0 0 192 192");
      expect(sr.querySelector(".sk-login__label")?.textContent.trim()).toBe("Sign in with Solarpass");
    });

    await step("label attribute replaces the button text", async () => {
      const sr = shadowOf("#relabelled");
      await waitFor(() => expect(sr.querySelector(".sk-login__label")?.textContent.trim()).toBe("Continue with Solar"));
      expect(sr.querySelector(".sk-login__logo svg")).not.toBeNull();
    });

    await step("icon=\"\" hides the mark", async () => {
      const sr = shadowOf("#no-icon");
      await waitFor(() => expect(sr.querySelector(".sk-login__label")?.textContent.trim()).toBe("Sign in"));
      expect(sr.querySelector(".sk-login__logo")).toBeNull();
    });

    await step("icon URL swaps the mark for an image", async () => {
      const sr = shadowOf("#custom-icon");
      await waitFor(() => expect(sr.querySelector(".sk-login__logo--image img")).not.toBeNull());
      expect(sr.querySelector(".sk-login__logo svg")).toBeNull();
      expect(sr.querySelector(".sk-login__logo img")?.getAttribute("src")).toContain("data:image/svg+xml");
    });

    await step("internal nodes expose parts for ::part() styling", async () => {
      const sr = shadowOf("#default");
      expect(sr.querySelector(".sk-login__solarpass")?.getAttribute("part")).toBe("button");
      expect(sr.querySelector(".sk-login__label")?.getAttribute("part")).toBe("label");
      expect(sr.querySelector(".sk-login__logo")?.getAttribute("part")).toBe("logo");
      expect(sr.querySelector(".sk-login__guest")?.getAttribute("part")).toBe("guest");
    });
  },
};

/** A provider `error` relayed by the popup surfaces in the element. */
export const AuthError: Story = {
  render: (args) => {
    const s = new SunkenLandSession({ storage: inMemorySessionStorage() });
    configure({ session: s, oidc: { clientId: "sunkenland-widget" } });
    (window as unknown as { __testSession?: SunkenLandSession }).__testSession = s;
    resetStub();
    return render(args);
  },
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-login");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    const popup = stubOidcPopup();

    try {
      await step("provider denial renders an alert and mirrors onto the host", async () => {
        (sr.querySelector(".sk-login__solarpass") as HTMLButtonElement).click();
        await waitFor(() => expect(popup.url).not.toBeNull());
        popup.relay({ error: "access_denied" });

        await waitFor(() =>
          expect(sr.querySelector(".sk-login__error")?.textContent.trim()).toBe("access_denied"),
        );
        await waitFor(() => expect(el.getAttribute("data-error")).toBe("access_denied"));
        // The guest button remains so the user can retry, and no session exists.
        expect(sr.querySelector(".sk-login__solarpass")).not.toBeNull();
        expect(stubState.oidcExchanges).toBe(0);
      });
    } finally {
      popup.restore();
    }
  },
};
