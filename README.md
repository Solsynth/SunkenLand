# SunkenLand

Embeddable `sk-*` web components for Solar Network content, backed by a
zod-validated Stargate API client. Drop-in vanilla custom elements — no Vue
required on the host — with an OAuth session layer so users can sign in and
write (reply, react), not just read.

Ported from FloatLand's API layer and adapted for third-party hosts: elements
talk to the API directly with a pluggable access-token provider instead of
relying on a same-origin server session.

The bundle embeds its own Vue, so nothing is Vue-specific at runtime; `vue` and
`zod` are declared as dependencies because the emitted `.d.ts` references them.

## Install

The package is on **GitHub Packages**, which requires a token for *every*
install (public packages included) — so consumers point npm at the registry
with a scoped `.npmrc`:

```ini
# .npmrc
@solsynth:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```sh
NODE_AUTH_TOKEN=$(gh auth token) bun add @solsynth/sunken-land
```

```js
// ESM — registers every sk-* element
import { configure } from "@solsynth/sunken-land";
```

```html
<!-- CDN (IIFE) — exposes the `SunkenLand` global -->
<!-- Serve dist/ from your own origin: the registry needs a token, so jsdelivr
     and unpkg cannot proxy GitHub Packages -->
<script src="/vendor/sunken-land.iife.js"></script>
<script>
  SunkenLand.configure({ css: "/vendor/presets/replies-list.css" });
</script>
```

### Nuxt / SSR

The elements are browser-only, but *importing* the package is safe on the
server — the registration is a no-op without a `customElements` registry — so a
client-only plugin is all you need:

```ts
// plugins/sunkenland.client.ts
import { configure } from "@solsynth/sunken-land";

export default defineNuxtPlugin(() => {
  configure({
    baseUrl: "https://api.solian.app",
    css: ["/presets/replies-list.css", "/presets/reactions.css"],
    stickerUrl: "/stickers/{symbol}.webp",
  });
});
```

```ts
// nuxt.config.ts — `sk-*` tags are custom elements, not Vue components
export default defineNuxtConfig({
  vue: {
    compilerOptions: { isCustomElement: (tag: string) => tag.startsWith("sk-") },
  },
});
```

Server routes can use the package's API layer directly — `import { createApiClient } from "@solsynth/sunken-land"` — because nothing in the module touches the DOM at import time.

## Quick start

```html
<sk-replies-list post="post_1" take="6" order-desc></sk-replies-list>

<sk-reply-composer post="post_1"></sk-reply-composer>

<sk-reaction-list post="post_1"></sk-reaction-list>

<sk-login></sk-login>
```

```js
// Once at startup: everything that applies to every element.
SunkenLand.configure({
  baseUrl: "https://api.solian.app",
  css: [
    "/presets/replies-list.css",
    "/presets/login.css",
    "/presets/reply-composer.css",
    "/presets/reactions.css",
  ],
  // Reaction stickers. The set ships in `dist/stickers/` (copied from
  // FloatLand's sticker set) — point this at your CDN, or omit it for emoji.
  stickerUrl: "/dist/stickers/{symbol}.webp",
  oidc: {
    clientId: "your-app-slug",              // registered app + redirect URI
    redirectUri: "https://your.site/page",
    scopes: ["openid", "profile", "email"],
    mode: "popup",
  },
});
```

## Configuration

`SunkenLand.configure(config)` merges library-wide settings. It is read when
an element is created (so call it before elements connect); `css` re-syncs
live for already-mounted elements.

| Key | Purpose |
| --- | --- |
| `baseUrl` | API origin (default `https://api.solian.app`). |
| `css` | Preset stylesheet URL(s) injected into every element's shadow root (an element's `css` attribute overrides it; `css=""` disables styling). |
| `stickerUrl` | Reaction sticker template with `{symbol}` substituted, used by `sk-reaction-list` (`sticker-url=""` disables stickers for one element). |
| `oidc` | Solarpass client defaults: `clientId`, `issuer`, `redirectUri`, `scopes`, `mode`. |
| `token` | A ready-made access token — skips the login button entirely (see below). |
| `getAccessToken` | Function form of `token`, for dynamic credentials. |
| `session` | `SunkenLandSession` instance to use (default: the `session` singleton). |
| `getAccessToken` / `refreshAccessToken` / `onUnauthorized` | Override the auth hooks the API client uses (default: the session's). |
| `fetchImpl` | Test/SSR seam for `fetch`. |

Per-element `base-url` and `css` attributes override the shared config for that
element (`css=""` disables preset styling entirely).

## Elements

All elements are deliberately **unstyled** — semantic markup only — and opt
into the FloatLand-flavored look through the presets. They share the session,
so signing in once updates every element on the page.

### `sk-replies-list`

Threaded replies for a parent post. Public reads, no login required.

- Attributes: `post` (required), `take`, `offset`, `query-term`, `realm`,
  `media`, `order-desc`, `type`, `pub`, `header`, `view-all-url`, `css`,
  `base-url`
- Events: `reply-click` (`detail = { postId, post }`)
- Slots: `header`, `loading`, `error`, `empty`, `load-more`, `view-all`
  (error overrides can read the message from the host's `data-error`)
- Re-fetches automatically when a reply to the same `post` is posted on the
  page (`sunkenland:reply-posted`)

### `sk-login`

Solar mark + **"Sign in with Solarpass"** button (Google-style pill); signed
in, it shows the account's initials avatar, display name, and a Sign out button.

- Attributes: `client-id`, `issuer`, `redirect-uri`, `scopes`, `mode`
  (`popup` default | `redirect`), `label` (default "Sign in with Solarpass"),
  `icon` (URL; `icon=""` hides the mark), `css`, `base-url` — all of them
  default to `configure({ oidc, css })`
- Events: `sign-in`, `sign-out`
- Slots: `sign-in`, `signed-in`
- Parts: `guest`, `error`, `button`, `logo`, `label`, `user`, `avatar`, `name`,
  `signout`

### `sk-reply-composer`

Reply box for a parent post. Signed out it shows the same branded sign-in
button; signed in it posts as the account's publisher.

- Attributes: `post` (required to submit), `pub` (pin the publisher — hides
  the switcher), `client-id`, `issuer`, `redirect-uri`, `scopes`, `mode`,
  `label`, `icon`, `placeholder`, `submit-label`, `max-length`, `css`,
  `base-url`
- Publisher switcher: lists `GET /sphere/publishers?mine=true` (avatar,
  display name, `@handle`), defaulting to the first and posting as the chosen
  one — same behavior as FloatLand's composer
- Events: `reply-posted` (`detail = { postId, post }`); also broadcast on
  `window` as `sunkenland:reply-posted` so a sibling `sk-replies-list` refreshes
- Slots: `sign-in`, `error`
- Parts: `guest`, `hint`, `button`, `logo`, `label`, `form`, `meta`, `as`,
  `input`, `bar`, `count`, `submit`, `error`

### `sk-reaction-list`

Reaction bar for a post — the embeddable port of FloatLand's
`PostReactionList`: one chip per reaction (sticker + count, highlighted when it
is yours) plus the **React** picker with the platform's 15-reaction set
(attitude 0/1/2). Reads `GET /sphere/posts/{post}` for `reactionsCount` and, when
the page carries a session, `reactionsMade` — so a signed-in visitor sees their
own reactions highlighted.

- Attributes: `post` (required), `max-visible` (chips before the `+N` toggle,
  default 5), `picker` (`picker="false"` renders the chips only), `react-label`
  (default "React"; `react-label=""` shows the icon alone), `sticker-url`
  (overrides `configure({ stickerUrl })`; `sticker-url=""` falls back to emoji),
  `client-id`, `issuer`, `redirect-uri`, `scopes`, `mode` (used when a guest
  reacts — a popup by default), `css`, `base-url`
- Toggling is **optimistic**: the chip updates immediately and rolls back with
  a `data-error` message if the request fails. Signed out, clicking a reaction
  starts the Solarpass sign-in flow and the bar re-reads the post afterwards.
- Events: `reaction-added` / `reaction-removed` (`detail = { postId, symbol,
  attitude, count }`)
- Slots: `picker` (replaces the whole reaction menu — translations, custom
  catalogs), `empty`, `error`
- Parts: `list`, `trigger`, `trigger-icon`, `trigger-label`, `menu`, `option`,
  `option-label`, `chip`, `emoji`, `sticker`, `count`, `more`, `empty`, `error`
  (chips carry `data-symbol` and `data-reacted="true"` when yours)

```html
<sk-reaction-list post="post_1" max-visible="5"></sk-reaction-list>
```

### Stickers

`dist/stickers/*.webp` ships the reaction stickers (copied from FloatLand's
`public/images/stickers`): the 15 offered reactions plus 5 symbols other
clients can send (`eat`, `onegai`, `sleepy`, `sorry`, `thinking`). Serve the
directory and point `stickerUrl` at it; each chip/option renders
`<img src="{template with symbol}">` with the reaction label as `alt`.

```js
// Bundled set, straight from the package on a CDN:
SunkenLand.configure({
  stickerUrl:
    "/vendor/stickers/{symbol}.webp", // a copy of the package's dist/stickers
});
```

Without a template (or with `sticker-url=""`), reactions render as emoji.

## Sign in with Solarpass (OpenID Connect)

Solarpass is the platform **identity provider**, not a backend "connection":
the widgets are OpenID Connect clients of it. Endpoints come from the issuer's
discovery document, so nothing is hardcoded beyond the default issuer:

```
issuer                 https://api.solian.app
authorization_endpoint https://id.solian.app/auth/authorize
token_endpoint         https://api.solian.app/stargate/auth/open/token
userinfo_endpoint      https://api.solian.app/stargate/auth/open/userinfo
```

### Register a client first

Create an app (developer settings on solian.app) and add the page that will
finish the login to its **RedirectUris** — for the default flow that is the
page hosting the widget (`https://your.site/page`, no query/hash). Public
clients are supported (`token_endpoint_auth_methods_supported` includes
`none`), so no secret is needed or accepted in the browser.

```js
SunkenLand.configure({
  oidc: {
    clientId: "your-app-slug",   // or per element: client-id="your-app-slug"
    // issuer, redirectUri, scopes, mode also default sensibly
  },
});
```

### How the flow runs

1. The visitor clicks **Sign in with Solarpass**.
2. The SDK discovers the issuer, generates PKCE (`S256`) + `state` + `nonce`,
   and opens the provider's authorization page in a **popup window** — the host
   page is never navigated. (`mode: "redirect"` navigates this page instead.)
3. The visitor authenticates at the provider (password, passkey, or a linked
   connection — that UI lives there).
4. The provider redirects the popup to your registered redirect URI with
   `?code=&state=`. The SDK running on that page relays the code to the opener
   via `postMessage` and closes the popup.
5. The opener verifies `state`, exchanges the code at the token endpoint with
   its PKCE verifier, resolves the account, persists the tokens, and broadcasts
   `sunkenland:signin`.

Tokens land in the session (localStorage by default) and authenticate every
element plus `apiFetch`; refreshes use the provider's `refresh_token` grant.

```js
import { session } from "@solsynth/sunken-land";

await session.signInWithOidc();                 // popup, PKCE
await session.signInWithOidc({ mode: "redirect" });
await session.resumeAuth();                     // completes a redirect/popup callback
await session.signOut();
```

User-level outcomes (popup closed, provider denial, `state` mismatch, failed
exchange) resolve with `state`/`error` and emit `sunkenland:auth-error`;
configuration failures (missing client id, discovery) reject.

### Bringing your own credential

A host that already holds an access token does not need the login button at all
— configure the token and the elements authenticate with it:

```js
SunkenLand.configure({ token: "eyJhbGciOi…" });

// or a dynamic provider (rotating tokens)
SunkenLand.configure({ getAccessToken: () => myTokenStore.current() });
```

The session adopts the credential, resolves the account through the API, and
the widgets render the signed-in state — the composer is usable and
`apiFetch` is authenticated. Because the host owns the token's lifetime, Sign
out is hidden and there is no refresh: when the token expires, requests fail
and the widget surfaces `The configured access token was rejected: …` (plus
`sunkenland:auth-error`) so the host can supply a fresh one.

### Session

`session` is a process-wide `SunkenLandSession` backed by `localStorage` under
`sunkenland:session` (access token, refresh token, expiry, account). It
provides the API client's `getAccessToken` / `refreshAccessToken` /
`onUnauthorized` hooks, so a `401` triggers one refresh + retry and a dead
session signs out cleanly.

```js
import { SunkenLandSession, inMemorySessionStorage } from "@solsynth/sunken-land";

configure({
  session: new SunkenLandSession({ storage: inMemorySessionStorage() }), // or sessionStorage, per-tenant keys
});
```

## Theming

Three mechanisms, all host-side — no need to fork the elements.

Presets are injected per element as `<link>`s, but hosts configure every preset
at once, so each preset scopes its rules to a marker class the component sets on
its host (`sk-replies-list.sk-replies`, `sk-login.sk-login`,
`sk-reply-composer.sk-composer`, `sk-reaction-list.sk-reactions`). That keeps
one preset from styling — or clipping, via `overflow` — another element. The
marker also survives custom tag names (`defineReactionList("my-reactions")`).

**1. `--sk-*` custom properties.** The presets are built entirely from tokens,
so overriding them re-skins the widget without writing selectors:

```css
sk-login {
  --sk-btn-radius: 0.5rem;
  --sk-btn-border-color: #d0d7de;
  --sk-btn-border-width: 2px;
  --sk-btn-bg: #f7f4ff;
}

sk-reply-composer {
  --sk-primary: oklch(62% 0.2 300deg);
  --sk-submit-bg: var(--sk-primary);
  --sk-input-radius: 0.5rem;
}

sk-reaction-list {
  --sk-chip-mine-bg: color-mix(in oklch, #4f46e5 18%, transparent);
  --sk-menu-columns: 4;
  --sk-menu-max-height: 20rem;
}
```

| Family | Tokens |
| --- | --- |
| Surfaces | `--sk-font`, `--sk-base-100/200/300`, `--sk-base-content`, `--sk-primary`, `--sk-primary-content`, `--sk-radius`, `--sk-border` |
| Brand button | `--sk-btn-radius`, `--sk-btn-border-width`, `--sk-btn-border-color`, `--sk-btn-padding`, `--sk-btn-gap`, `--sk-btn-bg`, `--sk-btn-color`, `--sk-btn-hover-bg`, `--sk-btn-hover-border-color`, `--sk-btn-font-size`, `--sk-btn-font-weight`, `--sk-btn-shadow`, `--sk-btn-logo-size`, `--sk-btn-logo-color` |
| Login (signed in) | `--sk-avatar-bg`, `--sk-avatar-color`, `--sk-signout-color` |
| Composer | `--sk-input-radius`, `--sk-input-padding`, `--sk-input-bg`, `--sk-input-color`, `--sk-submit-radius`, `--sk-submit-padding`, `--sk-submit-bg`, `--sk-submit-color` |

**2. `::part()`.** Every internal node carries a part, so the host can style
it directly (including properties the tokens don't cover):

```css
sk-login::part(button) { border-style: dashed; text-transform: uppercase; }
sk-reply-composer::part(submit) { letter-spacing: 0.05em; }
sk-replies-list::part(reply) { border-left: 2px solid currentColor; }
```

Parts — `sk-login`: `guest`, `error`, `button`, `logo`, `label`, `user`,
`avatar`, `name`, `signout`. `sk-reply-composer`: `guest`, `hint`, `button`,
`logo`, `label`, `form`, `meta`, `as`, `input`, `bar`, `count`, `submit`,
`error`. `sk-replies-list`: `header`, `count`, `list`, `reply`, `avatar`,
`body`, `meta`, `author`, `handle`, `time`, `content`, `attachments`, `stats`,
`state`, `error`, `empty`, `load-more`, `view-all`.

Button text and icon are attributes too — `label="Continue with Solar"`,
`icon="/acme-mark.svg"`, or `icon=""` to drop the mark.

## `apiFetch` — anything the elements don't cover

The elements handle the common surfaces; `apiFetch` is the escape hatch. It
uses the live config + active session, so calls are authenticated, refresh once
on a 401, decode snake_case → camelCase, and validate against the package's
schemas.

```js
const post = await SunkenLand.apiFetch("/sphere/posts", {
  method: "POST",
  query: { pub: "me" },
  body: { content: "Hello", repliedPostId: "post_1" },
});

await SunkenLand.apiFetch("/sphere/posts/post_1/reactions", {
  method: "POST",
  body: { symbol: "thumb", attitude: 1 },
});

// Schema drives the return type (Throws ApiError / ZodError on failure).
const account = await SunkenLand.apiFetch("/stargate/accounts/me", {
  schema: SunkenLand.snAccountSchema,
});

// Anonymous call
await SunkenLand.apiFetch("/sphere/posts/post_1/replies/threaded", { auth: false });
```

`createApiClient(overrides?)` returns the same wiring as an `ApiClient`, for
hosts that want `requestWithHeaders` or a long-lived instance.

## API layer

Framework-agnostic, zod-validated client. Responses are snake_case on the wire
and validated as camelCase; request bodies are validated then snake_cased.

```js
import { configureApi, authApi, accountApi, postsApi } from "@solsynth/sunken-land";

configureApi({ baseUrl: "https://api.solian.app", getAccessToken: session.getAccessToken });

await postsApi.fetchPostRepliesThreaded("post_1", { take: 6 });           // public
await postsApi.createReply("post_1", "Nice!", { publisher: "me" });       // session
await postsApi.reactToPost("post_1", "thumb", 1);                         // session
await postsApi.removeReaction("post_1", "thumb");                         // session
await accountApi.getUserInfo();
await authApi.exchangeAuthorizationCode(code);
```

`authApi` covers OAuth token/authorize endpoints, the multi-factor challenge
flow, passkeys, QR login, account creation, and captcha. `accountApi` covers
profile, factors, contacts, connections, devices/sessions, publishing settings,
and notification preferences. `postsApi` covers reply reads plus post/reply
creation and reactions.

## Presets

Opt-in stylesheets (`presets/*.css`) replicating FloatLand's look — oklch
tokens, Nunito, light/dark via `prefers-color-scheme`. Injected into the shadow
root as `<link>`s; theme them by overriding the `--sk-*` custom properties on
the host element.

- `presets/replies-list.css`
- `presets/login.css`
- `presets/reply-composer.css`
- `presets/reactions.css`

## Publishing

Published to **GitHub Packages** as `@solsynth/sunken-land`. The scope
must be the repository owner, and `publishConfig` pins the registry
(`https://npm.pkg.github.com`) with public visibility. One-time setup:

1. Create the repo and push: `gh repo create Solsynth/SunkenLand --public --source . --push`
2. That is all — the workflow publishes with the repo's own `GITHUB_TOKEN`
   (`permissions: packages: write`), so no PAT secret is needed.

Per release:

```sh
npm version minor      # bumps package.json and creates the vX.Y.Z tag
git push --follow-tags # then .github/workflows/publish.yml runs, or publish by hand
```

The workflow type-checks and runs the browser suite before `npm publish`;
`prepack` builds `dist/` first, so a published tarball is never stale. Contents:
`dist/sunken-land.js` (ESM), `dist/sunken-land.iife.js` (CDN global),
`dist/presets/*.css`, `dist/stickers/*.webp`, `dist/types/**`, README, LICENSE.

The first publish must come from the workflow (GitHub links a package to the
repository that published it). A manual one needs a `write:packages` token —
the default `gh` login has `repo`/`workflow` only:

```sh
gh auth refresh --scopes write:packages
NODE_AUTH_TOKEN=$(gh auth token) npm publish
```

### Consumers need a token

GitHub Packages authenticates *all* npm traffic, so a consumer carries the
`.npmrc` from [Install](#install) and a token in `NODE_AUTH_TOKEN`. A Docker
build therefore copies `.npmrc` and takes the token as a build arg **before**
`npm install`:

```dockerfile
COPY package.json .npmrc ./
ARG NODE_AUTH_TOKEN
RUN npm install
```

```sh
docker build --build-arg NODE_AUTH_TOKEN="$TOKEN" .
```

`TOKEN` is a classic PAT with `read:packages`, or the consumer repo's
`GITHUB_TOKEN` (`permissions: packages: read`) when it sits in the same account.

### Plain HTML / CDN

GitHub Packages is not proxied by jsdelivr or unpkg, so hosts serve the built
files themselves (`dist/sunken-land.iife.js`, `dist/presets/*.css`,
`dist/stickers/*.webp`). Committing `dist/` would instead allow
`https://cdn.jsdelivr.net/gh/Solsynth/SunkenLand@vX.Y.Z/dist/…`.

### Consuming it before it is published

```sh
# in this repo
npm pack                     # → solsynth-sunken-land-<version>.tgz
# in the consumer
bun add ../SunkenLand/solsynth-sunken-land-<version>.tgz
# or link the checkout (rebuild dist on change)
bun link && bun link @solsynth/sunken-land
```

`file:`/link installs skip the registry (and its token) entirely — the tarball
carries `dist/`, so no build runs on the consumer side.

## Development

```sh
bun dev            # Storybook (stories double as browser tests)
bun run test       # Vitest + Playwright (headless story interactions)
bun run type-check # vue-tsc
bun run lint       # oxlint + eslint
bun run build      # dist ESM + IIFE bundles, preset copies, .d.ts
```

- `demo/index.html` — the elements on a plain HTML page with a stubbed API.
- `.storybook/fixtures.ts` — the fetch stub (auth, publishers, writes, reply
  reads) used by stories and tests.

## Notes

- Reads (reply lists, public profiles) work unauthenticated; writes attach the
  session token and surface the API's error message inline.
- Everything the elements accept as an attribute (`css`, `client-id`, `issuer`,
  `redirect-uri`, `scopes`, `mode`, `session`) can be set once with
  `SunkenLand.configure(...)`; the attribute wins for that element.
