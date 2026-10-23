<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { getConfig, onConfigChange, toStylesheetList } from '../config'
import { getSession, type SessionState } from '../session'
import { getHostElement, markHost } from '../utils/host'

/**
 * Drive picker trigger for embedded hosts.
 *
 * Renders a button that opens the SnFS file picker and reports what the person
 * chose. The picker is SnFS's own `/picker` page inside a frame: it browses the
 * drive, uploads new files, and answers with file ids. This element is the
 * thin, portable front door — it supplies the credential the frame needs and
 * turns the answer into an event.
 *
 * Authentication: a cross-site frame cannot receive the drive's `SameSite=Lax`
 * session cookie, so the element forwards the page's access token (the OIDC
 * session from `sk-login`, or `configure({ token })`) through `postMessage`.
 * Nothing goes in a URL.
 *
 * Deliberately UNSTYLED — the element renders a plain `<button>` and nothing
 * else. Opt into the preset via `configure({ css })` or the `css` attribute
 * (`presets/file-picker.css`); without it the host page's own button styling applies.
 *
 * Attributes:
 * - `label`: button text (default "Choose a file")
 * - `view`: `files` (default) | `folders` | `any`
 * - `multiple`: allow more than one (bare attribute or `multiple="true"`)
 * - `mime`: comma/space separated MIME types, e.g. `image/*,application/pdf`
 * - `accept`: comma/space separated extensions, e.g. `png,jpg`
 * - `upload`: offer uploading a new file (bare attribute)
 * - `drive`: SnFS origin (default `https://fs.solian.app`, or
 *   `configure({ drive })`)
 * - `title`, `description`: heading/guidance inside the frame
 * - `theme`: `auto` (default) | `dark` | `light`
 * - `locale`: `en` | `zh-CN` (default: the page's language)
 * - `css`: per-element stylesheet URL override (`css=""` disables styling)
 *
 * Properties:
 * - `open()`: opens the picker programmatically, exactly as clicking does
 *
 * Events (dispatched on the host element; bubble and are composed):
 * - `pick` with `detail = { files }` — the chosen files (`id`, `name`,
 *   `mimeType`, `url`, …), empty when the person cancelled
 * - `pick-error` with `detail = { error }` — the picker could not be shown or
 *   the drive refused the session
 *
 * Styling: `--sk-*` custom properties plus `part`s (`button`, `label`,
 * `icon`). See `presets/file-picker.css`.
 */

interface PickedFile {
  id: string
  name: string
  is_folder: boolean
  mime_type: string
  size: number
  extension: string
  kind: string
  url: string
  thumbnail_url: string | null
}

interface PickerSdk {
  openSnfsPicker: (
    config: { frameUrl: string; dialogTitle?: string; width?: number; height?: number },
    request: {
      options?: Record<string, unknown>
      token?: string
    },
    handlers?: { onSignedOut?: () => void; onError?: (message: string) => void },
  ) => Promise<PickedFile[]>
}

declare global {
  interface Window {
    openSnfsPicker?: PickerSdk['openSnfsPicker']
  }
}

const DEFAULT_DRIVE = 'https://fs.solian.app'

const props = withDefaults(
  defineProps<{
    label?: string
    view?: 'files' | 'folders' | 'any'
    multiple?: boolean | string
    mime?: string
    accept?: string
    upload?: boolean | string
    drive?: string
    title?: string
    description?: string
    theme?: 'auto' | 'dark' | 'light'
    locale?: string
    css?: string
  }>(),
  {
    label: 'Choose a file',
    view: 'files',
    theme: 'auto',
  },
)

const rootEl = ref<HTMLElement | null>(null)

const configVersion = ref(0)
const stopConfigSync = onConfigChange(() => {
  configVersion.value++
})
onUnmounted(stopConfigSync)

const stylesheets = computed<string[]>(() => {
  void configVersion.value
  if (props.css !== undefined) return props.css ? [props.css] : []
  return toStylesheetList(getConfig().css)
})

const session = getSession()
const state = shallowRef<SessionState>(session.state)
const stopSession = session.subscribe((snap) => {
  state.value = snap.state
})
onUnmounted(stopSession)

const driveOrigin = computed(() =>
  (props.drive || getConfig().drive || DEFAULT_DRIVE).replace(/\/+$/, ''),
)

const busy = ref(false)
const error = ref<string | null>(null)

/** Read a boolean-ish attribute the way the other elements do. */
function flag(value: boolean | string | undefined): boolean {
  if (value === undefined) return false
  return value !== false && String(value) !== 'false'
}

function list(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const parts = value
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length ? parts : undefined
}

/**
 * Loads the drive's embed script once. It is fetched on demand: a page that
 * never opens a picker should not pay for it, and the script lives on the
 * drive's origin so its origin check matches the frame it will create.
 */
let scriptLoading: Promise<PickerSdk> | null = null

function loadSdk(): Promise<PickerSdk> {
  if (window.openSnfsPicker) return Promise.resolve({ openSnfsPicker: window.openSnfsPicker })
  if (scriptLoading) return scriptLoading

  scriptLoading = new Promise<PickerSdk>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${driveOrigin.value}/picker/snfs-picker.js`
    script.async = true
    script.onload = () => {
      if (window.openSnfsPicker) resolve({ openSnfsPicker: window.openSnfsPicker })
      else reject(new Error('The SnFS picker loaded without its entry point.'))
    }
    script.onerror = () => reject(new Error('The SnFS picker could not be loaded.'))
    document.head.append(script)
  }).catch((caught: unknown) => {
    scriptLoading = null
    throw caught
  })

  return scriptLoading
}

function emit(name: 'pick' | 'pick-error', detail: unknown) {
  const host = getHostElement(rootEl.value)
  if (!host) return
  host.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
}

function fail(caught: unknown) {
  const message = caught instanceof Error ? caught.message : 'The picker could not be opened.'
  error.value = message
  emit('pick-error', { error: message })
}

async function open(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    const sdk = await loadSdk()
    // The token is what makes a cross-site frame work; a signed-out page can
    // still open the picker, and the drive's own sign-in flow takes over.
    const token = await session.getAccessToken()
    const files = await sdk.openSnfsPicker(
      {
        frameUrl: `${driveOrigin.value}/picker`,
        dialogTitle: props.title || props.label,
        width: props.view === 'folders' ? 680 : 720,
        height: 560,
      },
      {
        options: {
          view: props.view,
          multiple: flag(props.multiple),
          upload: flag(props.upload),
          mimeTypes: list(props.mime),
          extensions: list(props.accept),
          title: props.title,
          description: props.description,
          theme: props.theme,
          locale: props.locale,
        },
        token: token ?? undefined,
      },
      {
        onSignedOut: () => {
          // The frame cannot finish an OIDC sign-in on its own; the host owns
          // that flow (sk-login). Say so instead of showing an empty drive.
          error.value = 'Sign in to Solar Network to browse the drive.'
        },
        onError: (message) => {
          error.value = message
        },
      },
    )
    emit('pick', { files })
  } catch (caught) {
    fail(caught)
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  markHost(rootEl.value, 'sk-file-picker')
  void session.syncProvisioned()
})

defineExpose({ open })
</script>

<template>
  <div ref="rootEl" class="sk-file-picker-root" :data-state="busy ? 'busy' : state">
    <button
      type="button"
      class="sk-file-picker__button"
      part="button"
      :disabled="busy"
      :aria-busy="busy"
      @click="open"
    >
      <slot name="icon">
        <svg
          class="sk-file-picker__icon"
          part="icon"
          viewBox="0 0 16 16"
          width="16"
          height="16"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.2l1.3 1.5H13A1.5 1.5 0 0 1 14.5 6v5.5A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-7Z"
          />
        </svg>
      </slot>
      <span class="sk-file-picker__label" part="label">
        <slot>{{ busy ? 'Opening…' : label }}</slot>
      </span>
    </button>

    <p v-if="error" class="sk-file-picker__error" part="error" role="status">{{ error }}</p>

    <slot name="status" :state="state" :busy="busy" />

    <template v-if="stylesheets.length">
      <link v-for="href in stylesheets" :key="href" rel="stylesheet" :href="href" />
    </template>
  </div>
</template>
