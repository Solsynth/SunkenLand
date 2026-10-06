/**
 * Attribute helpers for the custom elements.
 *
 * Vue hands custom-element attributes through as raw strings, so the boolean
 * attributes the elements document (`flush`, `detail`, `bold`, `reference`,
 * `ignore-permissions`, …) need one shared reading of the same rules: bare and
 * `=""` mean on, `="false"` means off, anything else is on.
 */

/** Read a boolean-ish attribute value, falling back when it is absent. */
export function flagAttr(
  value: boolean | string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  return value !== false && String(value) !== "false";
}
