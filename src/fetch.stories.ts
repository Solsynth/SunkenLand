import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { expect, waitFor } from "storybook/test";
import { configure } from "./config";
import { apiFetch, createApiClient } from "./fetch";
import { SunkenLandSession, inMemorySessionStorage } from "./session";
import { snAccountSchema, type SnAccount } from "./api";
import { resetStub, stubOidcPopup, stubState } from "../.storybook/fixtures";

/**
 * `apiFetch` — session-aware escape hatch for endpoints the elements don't
 * cover.
 *
 * The play test drives it against the stubbed API to prove the contract
 * hosts rely on: the session token is attached, a 401 refreshes and retries,
 * bodies are snake_cased, and responses can be zod-validated. There is no UI
 * to look at — the story exists so the behavior runs in CI with everything
 * else.
 */

interface SdkArgs {
  note?: string;
}

const meta: Meta<SdkArgs> = {
  title: "SDK/apiFetch",
  tags: ["autodocs"],
  render: (args) => html`<p>${args.note}</p>`,
  args: { note: "apiFetch integration (see the Interactions panel / test output)." },
};

export default meta;

type Story = StoryObj<SdkArgs>;

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

export const AuthenticatedCall: Story = {
  play: async ({ step }) => {
    const session = new SunkenLandSession({ storage: inMemorySessionStorage() });
    configure({ session, oidc: { clientId: "sunkenland-widget" } });
    resetStub();

    await step("sign in, then post a reaction with the session token", async () => {
      await signIn(session);

      await apiFetch("/sphere/posts/post_1/reactions", {
        method: "POST",
        body: { symbol: "thumb", attitude: 1 },
      });

      const reaction = stubState.requests.find(
        (r) => r.method === "POST" && r.path === "/sphere/posts/post_1/reactions",
      );
      expect(reaction?.auth).toBe("Bearer oidc_at");
      // camelCase in, snake_case on the wire.
      expect(reaction?.body).toEqual({ symbol: "thumb", attitude: 1 });
    });

    await step("auth: false leaves the request anonymous", async () => {
      await apiFetch("/sphere/posts/post_1/replies/threaded", { auth: false });

      const read = stubState.requests.find(
        (r) => r.path === "/sphere/posts/post_1/replies/threaded",
      );
      // No Authorization header was sent (the stub records null).
      expect(read?.auth ?? null).toBeNull();
    });

    await step("query params + zod validation", async () => {
      const account = await apiFetch("/stargate/accounts/me", {
        schema: snAccountSchema,
      });
      expect(account.name).toBe("me");
      expect(account.nick).toBe("Me");
    });

    await step("createApiClient reuses one configured client", async () => {
      const client = createApiClient();
      const data = await client.request<SnAccount>("/stargate/accounts/me", {
        schema: snAccountSchema,
      });
      expect(data.id).toBe("acc_me");
    });

    // Last: a 401 signs the session out (the client's `onUnauthorized`), so it
    // would invalidate any authenticated step that followed.
    await step("surfaces API errors as ApiError and signs the session out", async () => {
      let status: number | undefined;
      let message: string | undefined;
      try {
        await apiFetch("/stargate/accounts/me", { auth: false });
      } catch (err) {
        status = (err as { status?: number }).status;
        message = (err as Error).message;
      }
      expect(status).toBe(401);
      expect(message).toBe("unauthorized");
      expect(session.state).toBe("signed-out");
    });
  },
};

export const RefreshChain: Story = {
  render: (args) => html`<p>${args.note}</p>`,
  play: async ({ step }) => {
    const session = new SunkenLandSession({ storage: inMemorySessionStorage() });
    configure({ session, oidc: { clientId: "sunkenland-widget" } });
    resetStub();
    stubState.failFirstPost = true;

    await step("a 401 on a write refreshes the token and retries once", async () => {
      await signIn(session);
      const before = stubState.oidcRefreshes;

      await apiFetch("/sphere/posts", {
        method: "POST",
        query: { pub: "me" },
        body: { content: "from apiFetch" },
      });

      const posts = stubState.requests.filter(
        (r) => r.method === "POST" && r.path === "/sphere/posts",
      );
      await waitFor(() => expect(posts.length).toBe(2));
      expect(posts[0]?.auth).toBe("Bearer oidc_at");
      expect(posts[1]?.auth).toBe("Bearer oidc_at_2");
      expect(stubState.oidcRefreshes).toBe(before + 1);
    });
  },
};
