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
 * - reactions POST/DELETE, logout → no-op 2xx
 * - anything else → 404
 *
 * Every request is recorded in `stubState.requests` (plus counters), which
 * the play tests assert against. `resetStub()` clears state between stories.
 */
export interface WireReply {
    post: Record<string, unknown>;
    depth: number;
    parent_id: string | null;
}
export declare const REPLIES: WireReply[];
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
}
export declare const stubState: StubState;
/** Reset counters + created replies between stories. */
export declare function resetStub(): void;
/** Replace global fetch with the stub. Safe to call multiple times. */
export declare function installApiStub(): void;
