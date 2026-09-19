/**
 * SunkenLand API layer — framework-agnostic, zod-validated client for the
 * Stargate API (account + OAuth/auth).
 *
 * Ported from FloatLand's `app/utils/api.ts` / `app/types/auth.ts`, adapted for
 * direct use inside embedded web components on any host: responses are
 * validated with zod, request bodies are validated + snake_cased, and auth
 * uses a pluggable access-token provider (no server-side session proxy).
 */

export * from "./schemas";

export {
  snakeToCamel,
  camelToSnake,
} from "./case";

export {
  ApiClient,
  ApiError,
  configureApi,
  getApiClient,
  API_BASE,
  API_BASE_URL,
} from "./client";
export type { ApiClientConfig, ApiRequestOptions, QueryValue } from "./client";

export {
  AuthApi,
  authApi,
  normalizeQrLoginStatus,
  detectDeviceName,
  buildDeviceInfo,
  PLATFORM_WEB,
} from "./auth";
export type {
  DeviceInfo,
  PollChallengeOptions,
  ChallengePollResult,
} from "./auth";

export {
  AccountApi,
  accountApi,
  defaultAccountBoard,
  parseAccountBoardItems,
} from "./account";
