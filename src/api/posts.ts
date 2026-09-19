import { ApiClient, getApiClient } from "./client";
import { snPostSchema, snThreadedReplyNodeSchema } from "./schemas/posts";
import type { SnPost, ThreadedReplyNode } from "./schemas/posts";

/**
 * Sphere data API — posts and replies.
 *
 * Ported from FloatLand's `app/utils/api.ts`. Reply reads are public, so every
 * method here runs unauthenticated (`auth: false`) and works from embedded
 * components on any host.
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
}

/** Process-wide posts API bound to the configured client. */
export const postsApi = new PostsApi();
