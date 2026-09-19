import type { ZodType } from "zod";
import { ApiClient, type ApiClientConfig, type ApiRequestOptions } from "./api/client";
import { getConfig } from "./config";
import { session as defaultSession } from "./session";

/**
 * Session-aware API access for hosts.
 *
 * The elements cover the common surfaces (replies, login, composing); this is
 * the escape hatch for everything else the Stargate API offers — reactions,
 * publishing settings, notifications, uploads — without re-implementing token
 * handling. It builds a client from the live `configure(...)` state and the
 * active session, so calls are authenticated, automatically refresh once on a
 * 401, and are decoded snake_case → camelCase (with optional zod validation).
 *
 *   // Any authenticated endpoint, from a CDN global or npm import
 *   const post = await SunkenLand.apiFetch("/sphere/posts", {
 *     method: "POST",
 *     query: { pub: "me" },
 *     body: { content: "Hello", repliedPostId: "post_1" },
 *   });
 *
 *   // Validate with one of the package's schemas
 *   const account = await SunkenLand.apiFetch("/stargate/accounts/me", {
 *     schema: SunkenLand.snAccountSchema,
 *   });
 *
 * Request bodies are serialized to snake_case and validated by the API layer's
 * schemas when one is supplied; failures throw `ApiError` (status, code,
 * detail, traceId) or `ZodError`.
 */

/**
 * `ApiRequestOptions` with the schema parameterized, so `apiFetch` infers the
 * result type from the schema the caller passes.
 */
export interface ApiFetchOptions<T> extends Omit<ApiRequestOptions, "schema"> {
  schema?: ZodType<T>;
}

/** An `ApiClient` wired to the live config + active session. */
export function createApiClient(
  overrides: Partial<ApiClientConfig> = {},
): ApiClient {
  const cfg = getConfig();
  const active = cfg.session ?? defaultSession;
  const authHooks: Pick<
    ApiClientConfig,
    "getAccessToken" | "refreshAccessToken" | "onUnauthorized"
  > = {
    // Host-provided hooks win; otherwise the session authenticates the call.
    getAccessToken: cfg.getAccessToken ?? active.getAccessToken,
    refreshAccessToken: cfg.refreshAccessToken ?? active.refreshAccessToken,
    onUnauthorized: cfg.onUnauthorized ?? active.onUnauthorized,
  };
  return new ApiClient({
    baseUrl: cfg.baseUrl,
    fetchImpl: cfg.fetchImpl,
    ...authHooks,
    ...overrides,
  });
}

/**
 * Authenticated request against the configured API origin.
 * `path` is API-relative (e.g. `/sphere/posts`) or absolute.
 */
export function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions<T> = {},
  overrides: Partial<ApiClientConfig> = {},
): Promise<T> {
  return createApiClient(overrides).request<T>(path, options);
}
