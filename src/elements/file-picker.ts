import { defineCustomElement } from 'vue'
import FilePicker from './FilePicker.vue'

/**
 * `sk-file-picker` custom element — a Drive file picker trigger.
 *
 * Clicking it opens SnFS's picker in a frame and dispatches `pick` with the
 * chosen files. The element forwards the page's access token to the frame, so
 * it works cross-site where the drive's session cookie cannot reach.
 *
 * Importing this module registers `sk-file-picker`; `defineFilePicker(tag)` registers
 * the same component under another tag. See `FilePicker.vue` for the full
 * attribute / property / event contract.
 */
export const FilePickerElement = defineCustomElement(FilePicker)

export function defineFilePicker(tag = 'sk-file-picker') {
  // The registry only exists in the browser: importing this module on the
  // server (Nuxt/Nitro SSR, vitest node) must not throw.
  if (typeof customElements === 'undefined') return undefined
  if (!customElements.get(tag)) {
    customElements.define(tag, defineCustomElement(FilePicker))
  }
  return customElements.get(tag)
}

defineFilePicker()
