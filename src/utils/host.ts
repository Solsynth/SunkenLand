/**
 * Host-element helpers for the shadow-rooted elements.
 *
 * A custom element's markup lives inside its shadow root, but some contracts
 * belong on the element the host page authored: the `data-error` mirror, and
 * the marker class the preset stylesheets scope their `:host` rules to.
 */

/** The custom element hosting a shadow-rooted component's root node. */
export function getHostElement(
  root: HTMLElement | null | undefined,
): HTMLElement | undefined {
  if (!root) return undefined;
  return (root.getRootNode() as ShadowRoot | undefined)?.host as
    | HTMLElement
    | undefined;
}

/**
 * Mark the host with the component's preset class.
 *
 * Presets are injected as `<link>`s into each element's shadow root, and
 * hosts are told to configure every preset at once
 * (`configure({ css: [ …all four… ] })`) — which would otherwise put
 * *every* preset's `:host` block inside *every* element. Presets therefore
 * scope `:host` to this marker (e.g. `:host(.sk-reactions)`), so one
 * element's surface (borders, background, `overflow`) can never clip or leak
 * onto another. The class also gives hosts a styling hook that survives
 * custom tag names (`defineReactionList("my-reactions")`).
 */
export function markHost(
  root: HTMLElement | null | undefined,
  className: string,
): void {
  getHostElement(root)?.classList.add(className);
}
