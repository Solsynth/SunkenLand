import type { ZodType } from "zod";
import { camelToSnake, snakeToCamel } from "./case";

/**
 * Framework-agnostic HTTP client for the Stargate API.
 *
 * Ported from FloatLand's `app/utils/api.ts`. Unlike FloatLand — which relies
 * on a Nuxt same-origin proxy holding the session server-side — this client
 * talks to the API directly so it can run inside embedded web components on
 * any host:
 *
 * - Responses are decoded from JSON, converted snake_case → camelCase, then
 *   validated against the package's zod schemas.
 * - Request bodies are validated and converted camelCase → snake_case.
 * - An optional access-token provider attaches `Authorization: Bearer`.
 * - An optional refresh callback turns a 401 into one refresh + retry.
 */

export const API_BASE = "api.solian.app";
export const API_BASE_URL = `https://${API_BASE}`;

export type QueryValue = string | number | boolean | null | undefined;

export interface ApiClientConfig {
  /** API origin, e.g. `https://api.solian.app`. */
  baseUrl?: string;
  /** Test seam / SSR override for the global fetch. */
  fetchImpl?: typeof fetch;
  /** Returns the current access token, or null when signed out. */
  getAccessToken?: () => string | null | Promise<string | null>;
  /**
   * Called on a 401 when `getAccessToken` is set. Return the NEW access token
   * to retry the request once, or null to surface the 401.
   */
  refreshAccessToken?: () => string | null | Promise<string | null>;
  /** Notified when a request fails auth even after refresh (session expired). */
  onUnauthorized?: () => void;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Serialized to a URL query string (null/undefined/empty skipped). */
  query?: Record<string, QueryValue> | URLSearchParams;
  /**
   * Plain object (validated + snake_cased + JSON), FormData, URLSearchParams,
   * or a pre-serialized string. Pass `body: undefined` for GET/DELETE.
   */
  body?: unknown;
  headers?: Record<string, string>;
  /** Attach the configured access token. Default true. */
  auth?: boolean;
  /** Validate the camelCased response against this schema. */
  schema?: ZodType<unknown>;
  /** AbortSignal forwarded to fetch. */
  signal?: AbortSignal;
}

/** Error envelope the backend returns alongside non-2xx statuses. */
interface ErrorBody {
  message?: unknown;
  code?: unknown;
  detail?: unknown;
  trace_id?: unknown;
  traceId?: unknown;
  errors?: unknown;
  meta?: unknown;
}

export class ApiError extends Error {
  status: number;
  /** Application-specific error code (e.g. `MERCHANT_PROFILE_NOT_FOUND`). */
  code?: string;
  detail?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
  meta?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    options?: {
      code?: string;
      detail?: string;
      traceId?: string;
      errors?: Record<string, string[]>;
      meta?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options?.code;
    this.detail = options?.detail;
    this.traceId = options?.traceId;
    this.errors = options?.errors;
    this.meta = options?.meta;
  }

  static fromBody(status: number, errorData: unknown): ApiError {
    if (typeof errorData === "object" && errorData !== null) {
      const body = errorData as ErrorBody;
      const message =
        typeof body.message === "string" && body.message.trim()
          ? body.message
          : `HTTP ${status}`;
      return new ApiError(message, status, {
        code: typeof body.code === "string" ? body.code : undefined,
        detail: typeof body.detail === "string" ? body.detail : undefined,
        traceId:
          typeof body.traceId === "string"
            ? body.traceId
            : typeof body.trace_id === "string"
              ? body.trace_id
              : undefined,
        errors:
          body.errors && typeof body.errors === "object"
            ? (body.errors as Record<string, string[]>)
            : undefined,
        meta:
          body.meta && typeof body.meta === "object"
            ? (body.meta as Record<string, unknown>)
            : undefined,
      });
    }
    if (typeof errorData === "string" && errorData.trim()) {
      return new ApiError(errorData, status);
    }
    return new ApiError(`HTTP ${status}`, status);
  }

  hasCode(code: string): boolean {
    return this.code === code;
  }
}

function parseResponse(text: string): unknown {
  if (!text || text.trim().length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.trim() };
  }
}

function serializeQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export class ApiClient {
  readonly baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #getAccessToken: ApiClientConfig["getAccessToken"];
  readonly #refreshAccessToken: ApiClientConfig["refreshAccessToken"];
  readonly #onUnauthorized: ApiClientConfig["onUnauthorized"];

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? API_BASE_URL).replace(/\/+$/, "");
    this.#fetch = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#getAccessToken = config.getAccessToken;
    this.#refreshAccessToken = config.refreshAccessToken;
    this.#onUnauthorized = config.onUnauthorized;
  }

  /** Absolute URL for `path` (optionally with a serialized query). */
  url(
    path: string,
    query?: Record<string, QueryValue> | URLSearchParams,
  ): string {
    if (query instanceof URLSearchParams) {
      const qs = query.toString();
      return `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
    }
    return `${this.baseUrl}${path}${serializeQuery(query)}`;
  }

  /**
   * Perform a request. Throws `ApiError` on non-2xx (after one 401 refresh +
   * retry when configured), and the schema's `ZodError` when a validated
   * response fails to parse.
   */
  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    return (await this.requestWithHeaders<T>(path, options)).data;
  }

  /**
   * Like `request`, but also returns the response `Headers` (e.g. to read
   * `x-total` on paginated list endpoints).
   */
  async requestWithHeaders<T>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<{ data: T; headers: Headers }> {
    const {
      method = "GET",
      query,
      body,
      headers: extraHeaders,
      auth = true,
      schema,
      signal,
    } = options;

    const headers: Record<string, string> = { ...extraHeaders };
    if (
      body !== undefined &&
      !(body instanceof FormData) &&
      !(body instanceof URLSearchParams) &&
      typeof body !== "string" &&
      !headers["Content-Type"]
    ) {
      headers["Content-Type"] = "application/json";
    }

    const wireBody =
      typeof body === "string" ||
      body instanceof FormData ||
      body instanceof URLSearchParams
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(camelToSnake(body));

    const doFetch = async (): Promise<Response> => {
      const token = auth ? await this.#getAccessToken?.() : null;
      const authHeaders: Record<string, string> = {};
      if (token) authHeaders["Authorization"] = `Bearer ${token}`;
      return this.#fetch(this.url(path, query), {
        method,
        headers: { ...authHeaders, ...headers },
        body: wireBody,
        signal,
      });
    };

    let response = await doFetch();

    // One 401 → refresh → retry pass, mirroring the FloatLand proxy behavior.
    if (response.status === 401 && auth && this.#refreshAccessToken) {
      const fresh = await this.#refreshAccessToken();
      if (fresh) {
        response = await doFetch();
      }
    }

    if (!response.ok) {
      if (response.status === 401) this.#onUnauthorized?.();
      const text = await response.text();
      throw ApiError.fromBody(response.status, parseResponse(text));
    }

    const text = await response.text();
    const data = parseResponse(text);
    const camel = snakeToCamel(data);
    return {
      data: schema ? (schema.parse(camel) as T) : (camel as T),
      headers: response.headers,
    };
  }
}

let sharedClient: ApiClient | null = null;

/**
 * The process-wide client used by the `auth` / `account` API singletons.
 * Hosts embedding the components call `configureApi()` once at startup.
 */
export function configureApi(config: ApiClientConfig): ApiClient {
  sharedClient = new ApiClient(config);
  return sharedClient;
}

export function getApiClient(): ApiClient {
  if (!sharedClient) sharedClient = new ApiClient();
  return sharedClient;
}
