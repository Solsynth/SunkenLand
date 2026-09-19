/**
 * Storybook API stub.
 *
 * The embeddable elements talk to `https://api.solian.app` via global fetch,
 * which is unreachable from Storybook/Vitest. This installs a fetch stub that
 * serves the same snake_case wire payloads the demo page uses, keyed by the
 * post id in the URL:
 *
 * - `/sphere/posts/post_1/replies/threaded` → 5 threaded replies, `x-total: 5`
 * - `/sphere/posts/post_empty/replies/threaded` → `[]`, `x-total: 0`
 * - anything else → 404
 */

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

/** Replace global fetch with the stub. Safe to call multiple times. */
export function installApiStub(): void {
  globalThis.fetch = async (input, _init) => {
    const raw = typeof input === "string" ? input : input.url;
    const url = new URL(raw, "http://storybook.local");
    const match = url.pathname.match(
      /^\/sphere\/posts\/([^/]+)\/replies\/threaded$/,
    );
    if (!match) {
      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const postId = decodeURIComponent(match[1] ?? "");
    const pool = postId === "post_empty" ? [] : REPLIES;
    const take = Number(url.searchParams.get("take") ?? 6);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const slice = pool.slice(offset, offset + take);
    return new Response(JSON.stringify(slice), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-total": String(pool.length),
      },
    });
  };
}
