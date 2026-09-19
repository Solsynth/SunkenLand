import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { expect, waitFor } from "storybook/test";
import { configure } from "./config";
import {
  SunkenLandSession,
  inMemorySessionStorage,
  PENDING_AUTH_KEY,
  OIDC_MESSAGE_TYPE,
  type SessionStorage,
} from "./session";
import {
  buildAuthorizeUrl,
  createPkcePair,
  defaultRedirectUri,
  discoverOidc,
} from "./oidc";
import { resetStub, stubOidcPopup, stubState } from "../.storybook/fixtures";

/**
 * Solarpass sign-in is a real OpenID Connect client: discovery from the
 * issuer, authorization code + PKCE in a popup, then the token endpoint.
 *
 * These stories drive the whole flow against the stubbed provider. The popup
 * itself is stubbed (`window.open` captured) because a test cannot complete an
 * interactive provider login — the popup's postMessage relay is then delivered
 * for real, so everything after the provider page is exercised.
 */

interface OidcArgs {
  note?: string;
}

const meta: Meta<OidcArgs> = {
  title: "SDK/Solarpass OIDC",
  tags: ["autodocs"],
  render: (args) => html`<p>${args.note}</p>`,
  args: { note: "OpenID Connect client behavior (see the test output)." },
};

export default meta;

type Story = StoryObj<OidcArgs>;

const CLIENT_ID = "sunkenland-widget";

/** Base64url of SHA-256, matching what the provider verifies for S256. */
async function s256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function freshSession(): { session: SunkenLandSession; storage: SessionStorage } {
  const storage = inMemorySessionStorage();
  const session = new SunkenLandSession({ storage });
  configure({ session, oidc: { clientId: CLIENT_ID } });
  (window as unknown as { __testSession?: SunkenLandSession }).__testSession = session;
  resetStub();
  return { session, storage };
}

/** The in-flight authorization request is consumed exactly once. */
function pendingIsCleared(storage: SessionStorage): boolean {
  return storage.get(PENDING_AUTH_KEY) === null;
}

/** `code_challenge` must be base64url(SHA-256(verifier)) and never the verifier. */
export const AuthorizeUrlAndPkce: Story = {
  play: async ({ step }) => {
    await step("discovery parses the provider document", async () => {
      const discovery = await discoverOidc();
      expect(discovery.authorizationEndpoint).toBe(
        "https://id.solian.app/auth/authorize",
      );
      expect(discovery.tokenEndpoint).toBe(
        "https://api.solian.app/stargate/auth/open/token",
      );
      expect(discovery.userinfoEndpoint).toBe(
        "https://api.solian.app/stargate/auth/open/userinfo",
      );
      expect(discovery.codeChallengeMethodsSupported).toContain("S256");
    });

    await step("PKCE challenge is the S256 digest of the verifier", async () => {
      const { verifier, challenge } = await createPkcePair();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(challenge).toBe(await s256(verifier));
      expect(challenge).not.toBe(verifier);
      // base64url alphabet only (no padding, no +/)
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    await step("authorize URL carries the code flow parameters", async () => {
      const discovery = await discoverOidc();
      const { verifier, challenge } = await createPkcePair();
      const url = new URL(
        buildAuthorizeUrl(discovery, {
          clientId: CLIENT_ID,
          redirectUri: "https://host.example/page",
          scopes: ["openid", "profile", "email"],
          state: "state-123",
          nonce: "nonce-456",
          codeChallenge: challenge,
        }),
      );
      expect(url.origin + url.pathname).toBe("https://id.solian.app/auth/authorize");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(url.searchParams.get("redirect_uri")).toBe("https://host.example/page");
      expect(url.searchParams.get("scope")).toBe("openid profile email");
      expect(url.searchParams.get("state")).toBe("state-123");
      expect(url.searchParams.get("nonce")).toBe("nonce-456");
      expect(url.searchParams.get("code_challenge")).toBe(await s256(verifier));
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      // The verifier never leaves the client before the token exchange.
      expect(url.toString()).not.toContain(verifier);
    });
  },
};

/** Full popup flow: authorize → relay → PKCE exchange → session. */
export const PopupSignIn: Story = {
  play: async ({ step }) => {
    const { session, storage } = freshSession();
    const popup = stubOidcPopup();
    let verifier = "";

    try {
      await step("sign-in opens the provider in a popup", async () => {
        const promise = session.signInWithOidc();
        await waitFor(() => expect(popup.url).not.toBeNull());
        expect(session.state).toBe("loading");

        const url = new URL(popup.url as string);
        expect(url.pathname).toBe("/auth/authorize");
        expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
        expect(url.searchParams.get("response_type")).toBe("code");
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("redirect_uri")).toBe(defaultRedirectUri());

        // The verifier stays client-side; only its digest is sent.
        const pending = JSON.parse(storage.get(PENDING_AUTH_KEY) ?? "{}");
        verifier = String(pending.verifier);
        expect(pending.clientId).toBe(CLIENT_ID);
        expect(url.searchParams.get("code_challenge")).toBe(await s256(verifier));
        expect(url.toString()).not.toContain(verifier);

        // The provider page would redirect the popup to the redirect URI; the
        // element there relays the code back to this window.
        popup.relay({ code: "provider-code-1" });

        const snapshot = await promise;
        expect(snapshot.state).toBe("signed-in");
      });

      await step("token exchange used PKCE and carries no secret", async () => {
        const exchange = stubState.requests.find(
          (r) => r.path === "/stargate/auth/open/token",
        );
        const fields = exchange?.body as Record<string, string>;
        expect(fields.grant_type).toBe("authorization_code");
        expect(fields.client_id).toBe(CLIENT_ID);
        expect(fields.code).toBe("provider-code-1");
        expect(fields.redirect_uri).toBe(defaultRedirectUri());
        expect(fields.code_verifier).toBe(verifier);
        expect(fields.client_secret).toBeUndefined();
        expect(pendingIsCleared(storage)).toBe(true);
      });

      await step("session is signed in with the OIDC profile", async () => {
        expect(session.isSignedIn).toBe(true);
        // The OIDC access token is accepted by the account API.
        expect(session.user?.id).toBe("acc_me");
        expect(session.user?.name).toBe("me");
        expect(session.user?.nick).toBe("Me");
        expect(stubState.oidcExchanges).toBe(1);
        const account = stubState.requests.find(
          (r) => r.path === "/stargate/accounts/me",
        );
        expect(account?.auth).toBe("Bearer oidc_at");
      });

      await step("signed-in session persists the OIDC binding", async () => {
        const persisted = JSON.parse(storage.get("sunkenland:session") ?? "{}");
        expect(persisted.oidc).toMatchObject({
          issuer: "https://api.solian.app",
          clientId: CLIENT_ID,
        });
        expect(persisted.accessToken).toBe("oidc_at");
        expect(persisted.refreshToken).toBe("oidc_rt");
      });

      await step("refresh uses the provider's refresh_token grant", async () => {
        const token = await session.refreshAccessToken();
        expect(token).toBe("oidc_at_2");
        expect(stubState.oidcRefreshes).toBe(1);
        const refresh = stubState.requests
          .filter((r) => r.path === "/stargate/auth/open/token")
          .at(-1);
        const fields = refresh?.body as Record<string, string>;
        expect(fields.grant_type).toBe("refresh_token");
        expect(fields.client_id).toBe(CLIENT_ID);
        expect(fields.refresh_token).toBe("oidc_rt");
      });
    } finally {
      popup.restore();
    }
  },
};

/** If the account API rejects the OIDC token, userinfo resolves the account. */
export const UserInfoFallback: Story = {
  render: () => html`<p>Awaiting the userinfo fallback.</p>`,
  play: async ({ step }) => {
    const { session } = freshSession();
    stubState.rejectAccountApiForOidc = true;
    const popup = stubOidcPopup();

    try {
      await step("signs in and resolves the account from userinfo", async () => {
        const pending = session.signInWithOidc();
        await waitFor(() => expect(popup.url).not.toBeNull());
        popup.relay({ code: "fallback-code" });
        const snapshot = await pending;

        expect(snapshot.state).toBe("signed-in");
        // sub → id, name → name, preferred_username → nick.
        expect(session.user?.id).toBe("acc_me");
        expect(session.user?.name).toBe("me");
        expect(session.user?.nick).toBe("Me");
        expect(
          stubState.requests.some((r) => r.path === "/stargate/auth/open/userinfo"),
        ).toBe(true);
      });
    } finally {
      popup.restore();
    }
  },
};

/** A response carrying the wrong `state` is rejected (CSRF binding). */
export const StateMismatch: Story = {
  play: async ({ step }) => {
    const { session, storage } = freshSession();
    const popup = stubOidcPopup();
    try {
      const promise = session.signInWithOidc();
      await waitFor(() => expect(popup.url).not.toBeNull());
      const state = new URL(popup.url as string).searchParams.get("state");

      await step("mismatched state → error, no session", async () => {
        window.postMessage(
          { type: OIDC_MESSAGE_TYPE, code: "c", state: `${state}-tampered` },
          window.location.origin,
        );
        const snapshot = await promise;
        expect(snapshot.state).toBe("signed-out");
        expect(snapshot.error).toContain("state mismatch");
        expect(stubState.oidcExchanges).toBe(0);
        expect(storage.get(PENDING_AUTH_KEY)).toBeNull();
      });
    } finally {
      popup.restore();
    }
  },
};

/** Closing the popup cancels cleanly — no error, still signed out. */
export const PopupCancelled: Story = {
  play: async ({ step }) => {
    const { session, storage } = freshSession();
    const popup = stubOidcPopup();
    try {
      const promise = session.signInWithOidc();
      await waitFor(() => expect(popup.url).not.toBeNull());

      await step("closed popup resolves signed-out without an error", async () => {
        popup.close();
        const snapshot = await promise;
        expect(snapshot.state).toBe("signed-out");
        expect(snapshot.error).toBeNull();
        expect(storage.get(PENDING_AUTH_KEY)).toBeNull();
      });
    } finally {
      popup.restore();
    }
  },
};

/** Missing client id is a configuration error, not a silent no-op. */
export const MissingClientId: Story = {
  render: () => {
    const storage = inMemorySessionStorage();
    const session = new SunkenLandSession({ storage });
    // No `oidc.clientId` configured.
    configure({ session, oidc: { clientId: undefined } });
    (window as unknown as { __testSession?: SunkenLandSession }).__testSession = session;
    resetStub();
    return html`<p>Awaiting configuration error.</p>`;
  },
  play: async ({ step }) => {
    const session = (window as unknown as { __testSession: SunkenLandSession }).__testSession;
    await step("sign-in rejects with an actionable message", async () => {
      let message = "";
      try {
        await session.signInWithOidc();
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message).toContain("OIDC client id is required");
      expect(stubState.requests.length).toBe(0);
    });
  },
};
