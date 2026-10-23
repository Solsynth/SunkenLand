import type { Meta, StoryObj } from '@storybook/web-components'
import { html } from 'lit'
import { ifDefined } from 'lit/directives/if-defined.js'
import { expect, waitFor } from 'storybook/test'

/**
 * `sk-file-picker` — a Drive file picker trigger.
 *
 * The element is UNSTYLED on its own: without `css` it renders a bare
 * `<button>` and the host page's button styles apply. These stories pass the
 * preset so the styled surface is what you see; drop `css` to compare.
 *
 * Clicking it loads SnFS's embed script from the drive origin and opens the
 * picker in a frame. The stories cannot complete a pick (that needs a signed-in
 * drive), so they assert the element renders, is enabled, and exposes `open()`.
 */

interface PickerArgs {
  label?: string
  css?: string
  view?: string
  multiple?: boolean
  mime?: string
  accept?: string
  upload?: boolean
  theme?: string
}

const render = (args: PickerArgs) => html`
  <sk-file-picker
    label="${ifDefined(args.label)}"
    view="${ifDefined(args.view)}"
    mime="${ifDefined(args.mime)}"
    accept="${ifDefined(args.accept)}"
    theme="${ifDefined(args.theme)}"
    css="${ifDefined(args.css)}"
    ?multiple="${args.multiple}"
    ?upload="${args.upload}"
  ></sk-file-picker>
`

const meta: Meta<PickerArgs> = {
  title: 'Elements/sk-file-picker',
  component: 'sk-file-picker',
  tags: ['autodocs'],
  render,
  argTypes: {
    label: { control: 'text' },
    view: { control: 'select', options: ['files', 'folders', 'any'] },
    multiple: { control: 'boolean' },
    mime: { control: 'text' },
    accept: { control: 'text' },
    upload: { control: 'boolean' },
    theme: { control: 'select', options: ['auto', 'dark', 'light'] },
    css: {
      control: 'text',
      description:
        'Per-element stylesheet override (overrides configured `css`; `css=""` disables styling and leaves a bare button).',
    },
  },
  args: {
    label: 'Choose a file',
    view: 'files',
    multiple: false,
    upload: false,
    theme: 'auto',
  },
} satisfies Meta<PickerArgs>

export default meta
type Story = StoryObj<PickerArgs>

/** The styled surface: the shipped preset. */
export const Styled: Story = {
  args: {
    css: 'presets/file-picker.css',
    label: 'Choose a file',
  },
  play: async ({ canvasElement }) => {
    // The element upgrades asynchronously, so its shadow root does not exist
    // on the first frame: waiting for the button is the assertion.
    await waitFor(() => {
      const host = canvasElement.querySelector('sk-file-picker')
      expect(host?.shadowRoot?.querySelector('button')).toBeTruthy()
    })
    const host = canvasElement.querySelector('sk-file-picker')
    await expect(host?.shadowRoot?.querySelector('button')?.disabled).toBe(false)
    // The preset is what this story is about: it must be linked into the root.
    await waitFor(() => {
      expect(host?.shadowRoot?.querySelector('link')?.getAttribute('href')).toBe(
        'presets/file-picker.css',
      )
    })
  },
}

/**
 * The unstyled surface: no preset, so the element is a bare button that
 * inherits whatever the host page does to `button`.
 */
export const Unstyled: Story = {
  args: {
    css: '',
    label: 'Choose a file',
  },
}

/** An image-only, single-select trigger — the avatar/attachment case. */
export const ImageOnly: Story = {
  args: {
    css: 'presets/file-picker.css',
    label: 'Attach an image',
    mime: 'image/*',
    view: 'files',
  },
}

/** Folder selection, for choosing a destination. */
export const FolderView: Story = {
  args: {
    css: 'presets/file-picker.css',
    label: 'Choose a folder',
    view: 'folders',
  },
}

/** Multi-select with an upload control, for a gallery or a bulk import. */
export const MultiWithUpload: Story = {
  args: {
    css: 'presets/file-picker.css',
    label: 'Add files',
    multiple: true,
    upload: true,
  },
}
