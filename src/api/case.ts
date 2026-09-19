/**
 * Case conversion between the Stargate wire format (snake_case) and the
 * package's camelCase domain types.
 *
 * Ported from FloatLand's `app/utils/case.ts`. The backend serializes every
 * payload in snake_case; the client converts responses to camelCase before
 * validation and converts request bodies back to snake_case before sending.
 */

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamel<T>(obj: unknown): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => snakeToCamel(item)) as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[toCamelCase(key)] = snakeToCamel(value);
    }
    return result as T;
  }

  return obj as T;
}

export function camelToSnake<T>(obj: unknown): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => camelToSnake(item)) as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[toSnakeCase(key)] = camelToSnake(value);
    }
    return result as T;
  }

  return obj as T;
}
