import { z } from "zod";
import { ApiClient, getApiClient } from "./client";
import {
  snPostSchema,
  snPublisherSchema,
  snThreadedReplyNodeSchema,
  createPostPayloadSchema,
  type SnPost,
  type SnPublisher,
  type ThreadedReplyNode,
} from "./schemas/posts";

/**
 * Sphere data API — posts and replies.
 *
 * Ported from FloatLand's `app/utils/api.ts`. Reply reads are public, so every
 * read method here runs unauthenticated (`auth: false`) and works from
 * embedded components on any host. Writes (`createPost`/`createReply`,
 * reactions) attach the configured access token and therefore require a
 * signed-in session.
 */

/**
 * Filters forwarded to the replies endpoint as query params. Field names and
 * wire serialization mirror FloatLand's `fetchPosts` options:
 * `queryTerm` → `query`, `orderDesc` → `orderDesc`, rest as-is.
 */
export interface ReplyListFilters {
  replies?: boolean;
  realm?: string;
  media?: boolean;
  queryTerm?: string;
  type?: string;
  orderDesc?: boolean;
  pub?: string;
}

export interface FetchThreadedRepliesOptions {
  /** Page size. FloatLand defaults to 3; the widget uses 6. */
  take?: number;
  offset?: number;
  filters?: ReplyListFilters;
}

export class PostsApi {
  constructor(private readonly client: ApiClient = getApiClient()) {}

  /** Flat list of a post's replies (newest first, like FloatLand's post page). */
  async fetchPostReplies(postId: string): Promise<SnPost[]> {
    return this.client.request<SnPost[]>(
      `/sphere/posts/${encodeURIComponent(postId)}/replies`,
      { auth: false, schema: snPostSchema.array() },
    );
  }

  /**
   * A single post (`GET /sphere/posts/{id}`) — includes `reactionsCount` and,
   * when the request carries a token, `reactionsMade` (symbol → did *I*
   * react). Public read, like FloatLand's `fetchPost`: the token is attached
   * when a session exists, so anonymous embeds still get the post.
   */
  async fetchPost(postId: string): Promise<SnPost> {
    return this.client.request<SnPost>(
      `/sphere/posts/${encodeURIComponent(postId)}`,
      { schema: snPostSchema },
    );
  }

  /**
   * Threaded replies with indentation depth. Total count comes from the
   * `x-total` response header (FloatLand reads the same header).
   */
  async fetchPostRepliesThreaded(
    postId: string,
    options: FetchThreadedRepliesOptions = {},
  ): Promise<{ nodes: ThreadedReplyNode[]; total: number }> {
    const { take = 6, offset = 0, filters } = options;
    const params = new URLSearchParams({
      take: String(take),
      offset: String(offset),
    });
    if (filters) {
      if (filters.replies !== undefined)
        params.set("replies", String(filters.replies));
      if (filters.realm) params.set("realm", filters.realm);
      if (filters.media !== undefined)
        params.set("media", String(filters.media));
      if (filters.queryTerm) params.set("query", filters.queryTerm);
      if (filters.type) params.set("type", filters.type);
      if (filters.orderDesc !== undefined)
        params.set("orderDesc", String(filters.orderDesc));
      if (filters.pub) params.set("pub", filters.pub);
    }

    const { data, headers } =
      await this.client.requestWithHeaders<ThreadedReplyNode[]>(
        `/sphere/posts/${encodeURIComponent(postId)}/replies/threaded`,
        { auth: false, query: params, schema: snThreadedReplyNodeSchema.array() },
      );
    const total = parseInt(headers.get("x-total") ?? "0", 10);
    return { nodes: data, total };
  }

  // ── Writes (require a signed-in session) ────────────────────────────────

  /**
   * The publishers the signed-in account can post as
   * (`GET /sphere/publishers?mine=true`). Mirrors FloatLand's compose dialog,
   * which offers these in its publisher picker. Requires a session.
   */
  async fetchMyPublishers(take = 100): Promise<SnPublisher[]> {
    return this.client.request<SnPublisher[]>("/sphere/publishers", {
      query: { mine: true, take },
      schema: z.array(snPublisherSchema),
    });
  }

  /**
   * The publishers an account posts as — the first one is the default target
   * for `createReply`. Public endpoint (like FloatLand's `fetchAccountPublishers`).
   */
  async fetchPublishersOf(accountId: string): Promise<SnPublisher[]> {
    return this.client.request<SnPublisher[]>(
      `/sphere/publishers/of/${encodeURIComponent(accountId)}`,
      { auth: false, schema: z.array(snPublisherSchema) },
    );
  }

  /**
   * Create a post (or reply) as `publisher`. `POST /sphere/posts?pub=…`.
   * Pass `repliedPostId` to make it a reply — see `createReply`.
   */
  async createPost(
    payload: z.input<typeof createPostPayloadSchema>,
    publisher: string,
  ): Promise<SnPost> {
    const clean = createPostPayloadSchema.parse(payload);
    const query = new URLSearchParams({ pub: publisher });
    return this.client.request<SnPost>("/sphere/posts", {
      method: "POST",
      query,
      body: clean,
      schema: snPostSchema,
    });
  }

  /**
   * Reply to `postId` as `publisher`. Mirrors FloatLand's composer payload:
   * `POST /sphere/posts?pub=<publisher>` with `replied_post_id = postId`.
   * Defaults: `visibility: 0` (public), no language (backend infers).
   */
  async createReply(
    postId: string,
    content: string,
    options: {
      publisher: string;
      visibility?: number;
      language?: string;
      title?: string;
      description?: string;
    },
  ): Promise<SnPost> {
    const { publisher, ...rest } = options;
    return this.createPost(
      { ...rest, content, repliedPostId: postId },
      publisher,
    );
  }

  /** Add a reaction (e.g. symbol `"thumb"`, attitude `1` = up). */
  async reactToPost(
    postId: string,
    symbol: string,
    attitude = 1,
  ): Promise<void> {
    await this.client.request<void>(
      `/sphere/posts/${encodeURIComponent(postId)}/reactions`,
      { method: "POST", body: { symbol, attitude } },
    );
  }

  /** Remove the caller's reaction with `symbol`. */
  async removeReaction(postId: string, symbol: string): Promise<void> {
    await this.client.request<void>(
      `/sphere/posts/${encodeURIComponent(postId)}/reactions/${encodeURIComponent(symbol)}`,
      { method: "DELETE" },
    );
  }
}

/** Process-wide posts API bound to the configured client. */
export const postsApi = new PostsApi();
