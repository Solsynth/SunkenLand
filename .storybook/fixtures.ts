/**
 * Storybook API stub.
 *
 * The embeddable elements talk to `https://api.solian.app` via global fetch,
 * which is unreachable from Storybook/Vitest. This installs a fetch stub that
 * serves the same snake_case wire payloads the demo page uses:
 *
 * - `/sphere/posts/{id}/replies/threaded` → threaded replies (`x-total` header)
 * - `/stargate/auth/token` → issues `at_test` (authorization_code) and
 *   `at_refreshed` (refresh_token) pairs
 * - `/stargate/accounts/me` → the stub account (requires the issued token)
 * - `/sphere/publishers/of/acc_me` → the account's publisher
 * - `POST /sphere/posts` → creates a reply; the FIRST attempt returns 401 so
 *   the client's refresh chain is exercised; success prepends to the pool
 * - `/sphere/posts/{id}` → the post with its reaction counts (+ `reactions_made`
 *   when the request carries a token)
 * - reactions POST/DELETE mutate the per-post reaction store, logout → 2xx
 * - anything else → 404
 *
 * Every request is recorded in `stubState.requests` (plus counters), which
 * the play tests assert against. `resetStub()` clears state between stories.
 */

import { OIDC_MESSAGE_TYPE } from "../src/session";

export interface WireReply {
  post: Record<string, unknown>;
  depth: number;
  parent_id: string | null;
}

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

/** Inline SVG avatar so fixture images load without network access. */
const BOB_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
      '<circle cx="32" cy="32" r="32" fill="#8b6cf0"/>' +
      '<text x="32" y="42" font-family="sans-serif" font-size="28" font-weight="600" fill="#ffffff" text-anchor="middle">B</text>' +
      "</svg>",
  );

function makePost(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    title: null,
    description: null,
    content: "body",
    content_type: 0,
    published_at: minutesAgo(5),
    visibility: 1,
    boost_count: 0,
    upvotes: 0,
    downvotes: 0,
    replies_count: 1,
    reactions_count: {},
    reactions_made: null,
    views_unique: 0,
    views_total: 0,
    is_truncated: false,
    publisher: {
      id: `p_${id}`,
      name: "alice",
      nick: "Alice",
      bio: null,
      picture: null,
      background: null,
      verification: null,
      account: { id: "acc_1", name: "alice", nick: "Alice", profile: null },
      stat: null,
      created_at: "2023-01-01T00:00:00Z",
    },
    attachments: [],
    tags: [],
    replied_post: null,
    forwarded_post: null,
    meta: null,
    resource_identifier: `post.${id}`,
    created_at: minutesAgo(5),
    edited_at: null,
    updated_at: minutesAgo(5),
    ...overrides,
  };
}

export const REPLIES: WireReply[] = [
  {
    post: makePost("r1", {
      content:
        "Good question! See the **migration guide** at [docs](https://docs.solian.app).\n\nShort answer: it works on any host.",
      boost_count: 2,
      replies_count: 2,
    }),
    depth: 0,
    parent_id: null,
  },
  {
    post: makePost("r2", {
      content:
        "Follow-up: does it support **pagination**?\n\n```js\nconst page = await fetchPostRepliesThreaded(id, { take: 6 });\n```",
      published_at: minutesAgo(180),
      replies_count: 1,
      publisher: {
        id: "p_bob",
        name: "bob",
        nick: "Bob",
        bio: null,
        picture: {
          id: "f_bob",
          name: "bob.svg",
          url: BOB_AVATAR,
          mime_type: "image/svg+xml",
          has_compression: false,
          has_thumbnail: true,
          file_meta: {},
        },
        background: null,
        verification: null,
        account: { id: "acc_bob", name: "bob", nick: "Bob", profile: null },
        stat: null,
        created_at: "2023-02-01T00:00:00Z",
      },
    }),
    depth: 1,
    parent_id: "r1",
  },
  {
    post: makePost("r3", {
      content: "Seconded — ship it.",
      published_at: minutesAgo(2880),
    }),
    depth: 1,
    parent_id: "r1",
  },
  {
    post: makePost("r4", {
      content: "Yes — `take`/`offset` are supported, plus realm/media filters.",
      published_at: minutesAgo(30),
      boost_count: 1,
      replies_count: 0,
      publisher: {
        id: "p_bob",
        name: "bob",
        nick: "Bob",
        bio: null,
        picture: {
          id: "f_bob",
          name: "bob.svg",
          url: BOB_AVATAR,
          mime_type: "image/svg+xml",
          has_compression: false,
          has_thumbnail: true,
          file_meta: {},
        },
        background: null,
        verification: null,
        account: { id: "acc_bob", name: "bob", nick: "Bob", profile: null },
        stat: null,
        created_at: "2023-02-01T00:00:00Z",
      },
      attachments: [
        {
          id: "a1",
          name: "screenshot.png",
          url: "https://img.example/a1.png",
          mime_type: "image/png",
          has_compression: false,
          has_thumbnail: true,
          file_meta: {},
        },
      ],
    }),
    depth: 2,
    parent_id: "r2",
  },
  {
    post: makePost("r5", {
      content: "## Summary\n\nWe'll land this behind a feature flag next week.",
      published_at: minutesAgo(8640),
      upvotes: 7,
      verification: { type: 1, title: "Editor", description: null, verified_by: null },
    }),
    depth: 0,
    parent_id: null,
  },
];

/** Recorded requests + counters the play tests assert against. */
export interface StubRequest {
  method: string;
  path: string;
  query: string;
  body?: unknown;
  auth?: string | null;
}

export interface StubState {
  requests: StubRequest[];
  /** Number of times the token endpoint issued a pair (refresh increments). */
  tokenIssues: number;
  /** POST /sphere/posts attempts. */
  postAttempts: number;
  /**
   * When true, the first POST /sphere/posts is rejected 401 so the client
   * exercises the session refresh chain (retry carries the fresh token).
   */
  failFirstPost: boolean;
  /** Replies created via POST /sphere/posts (prepended to the threaded pool). */
  createdReplies: WireReply[];
  /** OIDC authorization_code exchanges seen at the token endpoint. */
  oidcExchanges: number;
  /** OIDC refresh_token grants seen at the token endpoint. */
  oidcRefreshes: number;
  /**
   * When true, `/stargate/accounts/me` rejects OIDC access tokens, forcing the
   * session to resolve the account from the userinfo endpoint instead.
   */
  rejectAccountApiForOidc: boolean;
  /** Reaction POST/DELETE attempts. */
  reactionAttempts: number;
  /** When true, reactions are rejected 400 so the optimistic rollback is testable. */
  failReactions: boolean;
  /** When true, the account has 10 publishers (long dropdown). */
  manyPublishers: boolean;
}

/** Per-post reactions on the wire (`symbol → count`), mutated by the stub. */
export const reactionStore: Record<string, Record<string, number>> = {};

/** Symbols the stub's visitor reacted with, per post (drives `reactions_made`). */
export const myReactions: Record<string, Set<string>> = {};

const SEEDED_REACTIONS: Record<string, Record<string, number>> = {
  post_1: { thumb_up: 3, heart: 1, party: 7, cry: 2, angry: 1, laugh: 1 },
};

export function seedReactions(): void {
  for (const key of Object.keys(reactionStore)) delete reactionStore[key];
  for (const key of Object.keys(myReactions)) delete myReactions[key];
  for (const [postId, counts] of Object.entries(SEEDED_REACTIONS)) {
    reactionStore[postId] = { ...counts };
    myReactions[postId] = new Set();
  }
  // The visitor already reacted with a heart on post_1, so the signed-in
  // stories can assert the "mine" highlight and the remove path.
  myReactions.post_1?.add("heart");
}

export const stubState: StubState = {
  requests: [],
  tokenIssues: 0,
  postAttempts: 0,
  failFirstPost: false,
  createdReplies: [],
  oidcExchanges: 0,
  oidcRefreshes: 0,
  rejectAccountApiForOidc: false,
  reactionAttempts: 0,
  failReactions: false,
  manyPublishers: false,
};

seedReactions();

/** Reset counters + created replies between stories. */
export function resetStub(): void {
  stubState.requests = [];
  stubState.tokenIssues = 0;
  stubState.postAttempts = 0;
  stubState.failFirstPost = false;
  stubState.createdReplies = [];
  stubState.oidcExchanges = 0;
  stubState.oidcRefreshes = 0;
  stubState.rejectAccountApiForOidc = false;
  stubState.reactionAttempts = 0;
  stubState.failReactions = false;
  stubState.manyPublishers = false;
  seedReactions();
}

/**
 * Replace `window.open` with a stub standing in for the provider popup: it
 * records the authorize URL, and `relay()` delivers the `{code, state}`
 * postMessage that the real redirect page would send to the opener.
 *
 * The rest of the flow (discovery, PKCE, token exchange, session) runs for
 * real against the stubbed endpoints, so stories exercise the actual OIDC
 * client rather than a shortcut.
 */
export interface OidcPopupStub {
  /** Authorize URL the SDK opened (null until sign-in is started). */
  readonly url: string | null;
  /** Relay the provider's result back to the opener. */
  relay(options?: { code?: string; error?: string }): void;
  /** Simulate the visitor closing the popup without finishing. */
  close(): void;
  /** Restore the original `window.open`. */
  restore(): void;
}

export function stubOidcPopup(): OidcPopupStub {
  const original = window.open;
  let authorizeUrl: string | null = null;
  let popup: { closed: boolean; focus: () => void } | null = null;

  window.open = ((url?: string | URL) => {
    authorizeUrl = String(url);
    popup = { closed: false, focus: () => {} };
    return popup;
  }) as unknown as typeof window.open;

  return {
    get url() {
      return authorizeUrl;
    },
    relay(options = {}) {
      const authorize = new URL(authorizeUrl ?? "http://localhost/");
      window.postMessage(
        {
          type: OIDC_MESSAGE_TYPE,
          code: options.code ?? "stub-authorization-code",
          error: options.error,
          state: authorize.searchParams.get("state"),
        },
        window.location.origin,
      );
      if (popup) popup.closed = true;
    },
    close() {
      if (popup) popup.closed = true;
    },
    restore() {
      window.open = original;
    },
  };
}

const ACCESS_TOKEN = "at_test";
const REFRESHED_ACCESS_TOKEN = "at_refreshed";
const OIDC_ACCESS_TOKEN = "oidc_at";
/** Token a host may inject with `configure({ token })`. */
export const CONFIGURED_TOKEN = "at_configured";
const OIDC_REFRESHED_TOKEN = "oidc_at_2";

const ACCOUNT_WIRE = {
  id: "acc_me",
  name: "me",
  nick: "Me",
  language: "en",
  activated_at: "2023-01-01T00:00:00Z",
  profile: {
    id: "pf_me",
    bio: "Widget tester",
    created_at: "2023-01-01T00:00:00Z",
    updated_at: "2023-01-01T00:00:00Z",
  },
  created_at: "2023-01-01T00:00:00Z",
  updated_at: "2023-01-01T00:00:00Z",
};

const SECOND_PUBLISHER_WIRE = {
  id: "p_me_alt",
  name: "me-alt",
  nick: "Me (alt)",
  bio: null,
  picture: null,
  background: null,
  verification: null,
  account: { id: "acc_me", name: "me", nick: "Me", profile: null },
  stat: null,
  created_at: "2023-01-01T00:00:00Z",
};

/** Ten publishers, used to prove the picker escapes the composer's box. */
const MANY_PUBLISHERS_WIRE = Array.from({ length: 10 }, (_, index) => ({
  id: `p_${index}`,
  name: index === 0 ? "me" : `me-${index}`,
  nick: index === 0 ? "Me" : `Me (${index})`,
  bio: null,
  picture: null,
  background: null,
  verification: null,
  account: { id: "acc_me", name: "me", nick: "Me", profile: null },
  stat: null,
  created_at: "2023-01-01T00:00:00Z",
}));

const PUBLISHER_WIRE = {
  id: "p_me",
  name: "me",
  nick: "Me",
  bio: null,
  picture: null,
  background: null,
  verification: null,
  account: { id: "acc_me", name: "me", nick: "Me", profile: null },
  stat: null,
  created_at: "2023-01-01T00:00:00Z",
};

function publishersWire(): unknown[] {
  return stubState.manyPublishers
    ? MANY_PUBLISHERS_WIRE
    : [PUBLISHER_WIRE, SECOND_PUBLISHER_WIRE];
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Replace global fetch with the stub. Safe to call multiple times. */
export function installApiStub(): void {
  globalThis.fetch = async (input, init) => {
    const raw =
      input instanceof Request
        ? input.url
        : typeof input === "string"
          ? input
          : input.href;
    const url = new URL(raw, "http://storybook.local");
    const method = (init?.method ?? "GET").toUpperCase();
    // Headers arrive as a plain object with the client's own casing — look up
    // case-insensitively (Headers instances already are).
    const header = (name: string): string | null => {
      const h = init?.headers;
      if (!h) return null;
      if (h instanceof Headers) return h.get(name);
      if (Array.isArray(h)) {
        const entry = h.find(([key]) => key.toLowerCase() === name);
        return entry ? entry[1] : null;
      }
      for (const [key, value] of Object.entries(h as Record<string, string>)) {
        if (key.toLowerCase() === name) return value;
      }
      return null;
    };
    const auth = header("authorization");

    const record = (body?: unknown) => {
      stubState.requests.push({
        method,
        path: url.pathname,
        query: url.search,
        body,
        auth,
      });
    };

    // ── OpenID Connect (Solarpass) ───────────────────────────────────────
    if (url.pathname === "/.well-known/openid-configuration") {
      record();
      return json({
        issuer: "https://api.solian.app",
        authorization_endpoint: "https://id.solian.app/auth/authorize",
        token_endpoint: "https://api.solian.app/stargate/auth/open/token",
        userinfo_endpoint: "https://api.solian.app/stargate/auth/open/userinfo",
        jwks_uri: "https://api.solian.app/.well-known/jwks",
        scopes_supported: ["openid", "profile", "email"],
        code_challenge_methods_supported: ["S256", "plain"],
        grant_types_supported: [
          "authorization_code",
          "refresh_token",
          "urn:ietf:params:oauth:grant-type:device_code",
        ],
        response_types_supported: ["code", "token", "id_token"],
        token_endpoint_auth_methods_supported: [
          "client_secret_basic",
          "client_secret_post",
          "none",
        ],
      });
    }
    if (url.pathname === "/stargate/auth/open/token" && method === "POST") {
      // OIDC token requests are form-encoded (unlike the JSON API).
      const form = new URLSearchParams(String(init?.body ?? ""));
      const fields = Object.fromEntries(form.entries());
      record(fields);
      if (fields.grant_type === "refresh_token") {
        stubState.oidcRefreshes++;
        return json({
          access_token: OIDC_REFRESHED_TOKEN,
          expires_in: 3600,
          refresh_token: "oidc_rt_2",
          token_type: "Bearer",
          scope: "openid profile email",
        });
      }
      stubState.oidcExchanges++;
      return json({
        access_token: OIDC_ACCESS_TOKEN,
        expires_in: 3600,
        refresh_token: "oidc_rt",
        token_type: "Bearer",
        id_token: "header.payload.signature",
        scope: "openid profile email",
      });
    }
    if (url.pathname === "/stargate/auth/open/userinfo") {
      record();
      const valid =
        auth === `Bearer ${OIDC_ACCESS_TOKEN}` ||
        auth === `Bearer ${OIDC_REFRESHED_TOKEN}`;
      if (!valid) {
        return new Response(null, {
          status: 401,
          headers: { "www-authenticate": "Bearer" },
        });
      }
      return json({
        sub: "acc_me",
        name: "me",
        preferred_username: "Me",
        email: "me@solar.test",
        email_verified: true,
      });
    }

    // ── Auth: token exchange / refresh / logout ──────────────────────────
    if (url.pathname === "/stargate/auth/token" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
      record(body);
      if (body.grant_type === "refresh_token") {
        stubState.tokenIssues++;
        return json({
          token: REFRESHED_ACCESS_TOKEN,
          expires_in: 3600,
          refresh_token: "rt_refreshed",
          refresh_expires_in: 604800,
        });
      }
      stubState.tokenIssues++;
      return json({
        token: ACCESS_TOKEN,
        expires_in: 3600,
        refresh_token: "rt_test",
        refresh_expires_in: 604800,
      });
    }
    if (url.pathname === "/stargate/auth/logout" && method === "POST") {
      record();
      return json({});
    }
    if (url.pathname === "/stargate/accounts/me" && method === "GET") {
      record();
      // The OIDC access token is a user token for this same API.
      const oidcToken =
        auth === `Bearer ${OIDC_ACCESS_TOKEN}` ||
        auth === `Bearer ${OIDC_REFRESHED_TOKEN}`;
      const valid =
        auth === `Bearer ${ACCESS_TOKEN}` ||
        auth === `Bearer ${REFRESHED_ACCESS_TOKEN}` ||
        auth === `Bearer ${CONFIGURED_TOKEN}` ||
        (oidcToken && !stubState.rejectAccountApiForOidc);
      return valid ? json(ACCOUNT_WIRE) : json({ message: "unauthorized" }, 401);
    }
    if (url.pathname === "/sphere/publishers/of/acc_me") {
      record();
      return json(publishersWire());
    }
    if (url.pathname === "/sphere/publishers" && url.searchParams.get("mine") === "true") {
      record();
      return json(
        auth ? publishersWire() : { message: "unauthorized" },
        auth ? 200 : 401,
      );
    }

    // ── Sphere writes ────────────────────────────────────────────────────
    if (url.pathname === "/sphere/posts" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      record(body);
      stubState.postAttempts++;
      // Optionally reject the first POST with 401 so the client exercises the
      // session refresh chain; the retry (fresh token) succeeds.
      if (stubState.failFirstPost && stubState.postAttempts === 1) {
        return json({ message: "token expired" }, 401);
      }
      const created = makePost("r_new", {
        content: String(body.content ?? ""),
        published_at: new Date().toISOString(),
        replies_count: 0,
        replied_post: null,
      });
      stubState.createdReplies.push({
        post: created,
        depth: 0,
        parent_id: body.replied_post_id ? String(body.replied_post_id) : null,
      });
      return json(created);
    }
    // ── Reactions: summary read + mutations ─────────────────────────────
    const postMatch = url.pathname.match(/^\/sphere\/posts\/([^/]+)$/);
    if (postMatch && method === "GET") {
      record();
      const postId = decodeURIComponent(postMatch[1] ?? "");
      const reacted = myReactions[postId];
      return json(
        makePost(postId, {
          reactions_count: { ...reactionStore[postId] },
          // Like the real API: `reactions_made` only for authenticated reads.
          reactions_made: auth && reacted
            ? Object.fromEntries([...reacted].map((symbol) => [symbol, true]))
            : null,
        }),
      );
    }
    const reactionsMatch = url.pathname.match(
      /^\/sphere\/posts\/([^/]+)\/reactions(?:\/([^/]+))?$/,
    );
    if (reactionsMatch && (method === "POST" || method === "DELETE")) {
      const postId = decodeURIComponent(reactionsMatch[1] ?? "");
      const pathSymbol = reactionsMatch[2]
        ? decodeURIComponent(reactionsMatch[2])
        : undefined;
      const counts = (reactionStore[postId] ??= {});
      const reacted = (myReactions[postId] ??= new Set());
      const body =
        method === "POST"
          ? (JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
          : undefined;
      record(body);
      stubState.reactionAttempts++;
      if (stubState.failReactions) {
        return json({ message: "reaction rejected" }, 400);
      }
      if (!auth) return json({ message: "unauthorized" }, 401);
      const symbol = String(body?.symbol ?? pathSymbol ?? "");
      if (method === "POST") {
        if (!reacted.has(symbol)) {
          counts[symbol] = (counts[symbol] ?? 0) + 1;
          reacted.add(symbol);
        }
      } else if (reacted.has(symbol)) {
        reacted.delete(symbol);
        const next = (counts[symbol] ?? 1) - 1;
        if (next > 0) counts[symbol] = next;
        else delete counts[symbol];
      }
      return new Response(null, { status: 204 });
    }

    // ── Threaded replies (existing behavior + created replies) ───────────
    const match = url.pathname.match(
      /^\/sphere\/posts\/([^/]+)\/replies\/threaded$/,
    );
    if (match) {
      const postId = decodeURIComponent(match[1] ?? "");
      const pool =
        postId === "post_empty"
          ? []
          : [...stubState.createdReplies, ...REPLIES];
      const take = Number(url.searchParams.get("take") ?? 6);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const slice = pool.slice(offset, offset + take);
      return json(slice, 200, { "x-total": String(pool.length) });
    }

    return json({ message: "not found" }, 404);
  };
}
