import { z } from "zod";

/**
 * Shared wire primitives for the Stargate API.
 *
 * The backend is a Go service and tolerates broad input, so schemas stay
 * permissive where the domain types are optional — rejecting a real payload
 * because of a missing optional field would break embedded components.
 */

/** Opaque backend identifier. */
export const snId = z.string().min(1);

/** Timestamp as emitted by the backend (RFC 3339 / ISO 8601). */
export const snTimestamp = z.string();

/** Optional nullable timestamp (e.g. `activatedAt`, `expiredAt`). */
export const snNullableTimestamp = z.string().nullable();

/** Free-form metadata blobs the backend embeds in several entities. */
export const snMeta = z.record(z.string(), z.unknown());

/**
 * Validates that `value` is a parsed camelCase payload of `schema` and returns
 * it. Used by the client after snake→camel conversion and by callers that want
 * to validate request bodies before sending.
 */
export function parseCamel<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

/** `z.ZodType` helper alias for the package's typed schema exports. */
export type ZodType<T> = z.ZodType<T>;
