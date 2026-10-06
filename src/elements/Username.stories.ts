import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { expect, waitFor } from "storybook/test";
import { stubState, usernameAccountFixture } from "../../.storybook/fixtures";
import type { SnUsernameColor } from "../api";
import {
  canUseUsernameColor,
  resolveUsernameColor,
  usernameColorStyle,
} from "../utils/username";
import type { UsernameData } from "../utils/username";

/** The element's JavaScript-only properties (see `AccountName.vue`). */
type UsernameHandle = HTMLElement & {
  account: string | UsernameData | null;
  publisher: UsernameData | null;
};

/**
 * `sk-username` — a colourful username, the embeddable port of FloatLand's
 * `AccountName.vue`.
 *
 * Stories render the actual custom element; `account` takes an account id and
 * the fetch stub in `.storybook/fixtures.ts` answers
 * `GET /stargate/accounts/{id}` (a public read) with fixture accounts covering
 * every colour case the Stellar tier gate distinguishes. A host that already
 * holds the post can hand over the `publisher` property instead and skip the
 * request.
 */

interface UsernameArgs {
  account?: string;
  name?: string;
  nick?: string;
  color?: string;
  colors?: string;
  direction?: string;
  tier?: string;
  verified?: string;
  verifiedTitle?: string;
  verifiedDescription?: string;
  bot?: boolean;
  size?: string;
  bold?: boolean;
  url?: string;
  ignorePermissions?: boolean;
  css?: string;
}

const render = (args: UsernameArgs) => html`
  <sk-username
    account="${ifDefined(args.account)}"
    name="${ifDefined(args.name)}"
    nick="${ifDefined(args.nick)}"
    color="${ifDefined(args.color)}"
    colors="${ifDefined(args.colors)}"
    direction="${ifDefined(args.direction)}"
    tier="${ifDefined(args.tier)}"
    verified="${ifDefined(args.verified)}"
    verified-title="${ifDefined(args.verifiedTitle)}"
    verified-description="${ifDefined(args.verifiedDescription)}"
    size="${ifDefined(args.size)}"
    bold="${args.bold === false ? "false" : ""}"
    url="${ifDefined(args.url)}"
    css="${ifDefined(args.css)}"
    ?bot="${args.bot}"
    ?ignore-permissions="${args.ignorePermissions}"
  ></sk-username>
`;

const meta: Meta<UsernameArgs> = {
  title: "Elements/sk-username",
  tags: ["autodocs"],
  render,
  argTypes: {
    account: {
      control: "text",
      description:
        "Account id or name, resolved through `GET /stargate/accounts/{account}` (public). Fixture ids (`acc_pink`, `acc_gradient`, `acc_denied`, `acc_plain_nova`, `acc_member`, `acc_untiered`, `acc_bot`) render offline; a real account needs the API toolbar set to Live.",
    },
    name: { control: "text", description: "Display name, no request." },
    nick: { control: "text", description: "Nickname; wins over `name`." },
    color: {
      control: "text",
      description: "Plain colour: a palette name (`pink`) or hex (`#ec4899`).",
    },
    colors: {
      control: "text",
      description: "Gradient stops, comma separated — implies a gradient.",
    },
    direction: {
      control: "text",
      description: "Gradient direction (default `to right`).",
    },
    tier: {
      control: "text",
      description:
        "Stellar tier (`solian.stellar.primary|nova|supernova`); gates the colour and supplies the membership default.",
    },
    verified: {
      control: "text",
      description: "Verification mark: bare attribute = type 0, or `0`–`6`.",
    },
    verifiedTitle: { control: "text" },
    verifiedDescription: { control: "text" },
    bot: { control: "boolean", description: "Show the automated mark." },
    size: { control: "text", description: "`sm`, `md` (default) or `lg`." },
    bold: { control: "boolean", description: "`bold=\"false\"` → normal weight." },
    url: {
      control: "text",
      description: "Makes the element a link: opened on click unless canceled.",
    },
    ignorePermissions: {
      control: "boolean",
      description: "Render the custom colour even when the tier denies it.",
    },
    css: {
      control: "text",
      description:
        "Per-element stylesheet override (overrides configured `css`; `css=\"\"` disables styling).",
    },
  },
  args: {
    account: "acc_pink",
  },
};

export default meta;

type Story = StoryObj<UsernameArgs>;

/** Palette names and hex colours must land on the same computed colour. */
const sameColor = (
  a: Element | null | undefined,
  b: Element | null | undefined,
): boolean => {
  if (!a || !b) return false;
  return getComputedStyle(a).color === getComputedStyle(b).color;
};

/** A probe span painted with `color`, to compare computed colours against. */
const swatch = (color: string): HTMLElement => {
  const probe = document.createElement("span");
  probe.style.color = color;
  return probe;
};

/**
 * A `primary` account with the palette colour `pink`: the tier allows named
 * palette colours, so the name renders in it.
 */
export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-username");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;

    await step("the account comes from the public account endpoint", async () => {
      await waitFor(() =>
        expect(sr.querySelector(".sk-username__name")?.textContent).toBe("Pinkster"),
      );
      await expect(
        stubState.requests.filter((r) => r.path === "/stargate/accounts/acc_pink").length,
      ).toBeGreaterThan(0);
    });

    await step("`pink` renders as the palette's hex", async () => {
      const name = sr.querySelector(".sk-username__name");
      canvasElement.append(swatch("#ec4899"));
      await expect(sameColor(name, canvasElement.querySelector("span:last-child"))).toBe(true);
    });

    await step("the active membership shows its star, in the tier colour", async () => {
      const mark = sr.querySelector('[part="membership"]');
      await expect(mark).not.toBeNull();
      await expect(mark?.querySelector("title")?.textContent).toBe("Membership · Stellar");
      canvasElement.append(swatch("#60a5fa"));
      await expect(sameColor(mark, canvasElement.querySelector("span:last-child"))).toBe(true);
    });

    await step("the marks center on the name's line box, not the text baseline", async () => {
      const row = sr.querySelector<HTMLElement>(".sk-username");
      // The preset must have made the shadow row a flex row; wait for the
      // stylesheet to land before measuring (vitest may still be loading it).
      await waitFor(() =>
        expect(["flex", "inline-flex"]).toContain(
          getComputedStyle(row as Element).display,
        ),
      );
      const centerY = (el: Element | null): number => {
        const box = el?.getBoundingClientRect();
        return box ? (box.top + box.bottom) / 2 : Number.NaN;
      };
      const nameCenter = centerY(sr.querySelector(".sk-username__name"));
      for (const mark of sr.querySelectorAll(".sk-username__mark")) {
        await expect(Math.abs(centerY(mark) - nameCenter)).toBeLessThan(0.5);
      }
    });
  },
};

/** A `supernova` account with a gradient: the tier allows it, so it clips. */
export const Gradient: Story = {
  args: { account: "acc_gradient" },
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-username");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");

    await step("the name paints the gradient and clips it to the text", async () => {
      await waitFor(() =>
        expect(el.shadowRoot?.querySelector(".sk-username__name")?.textContent).toBe(
          "BluewhaleTech",
        ),
      );
      const name = el.shadowRoot?.querySelector<HTMLElement>(".sk-username__name");
      // CSSOM drops the default `to bottom` when serializing, so assert the
      // stops (the non-default direction is covered by `InlineAttributes`).
      await expect(name?.style.background).toContain("linear-gradient");
      await expect(name?.style.background).toContain("rgb(57, 197, 187)");
      await expect(name?.style.background).toContain("rgb(0, 129, 203)");
      await expect(name?.style.webkitTextFillColor).toBe("transparent");
    });
  },
};

/**
 * A `primary` account asking for a gradient: the tier forbids it, so the name
 * renders uncoloured — FloatLand drops the colour rather than downgrading it.
 */
export const DeniedByTier: Story = {
  args: { account: "acc_denied" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-username");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector(".sk-username__name")?.textContent).toBe("Greedy"),
    );
    const name = el.shadowRoot.querySelector<HTMLElement>(".sk-username__name");
    await expect(name?.style.color).toBe("");
    await expect(name?.style.background).toBe("");
    // Not the membership colour either: the denied colour wins, as in FloatLand.
    canvasElement.append(swatch("#60a5fa"));
    await expect(
      getComputedStyle(name as Element).color,
    ).not.toBe(getComputedStyle(canvasElement.querySelector("span:last-child") as Element).color);
  },
};

/**
 * `ignore-permissions` is the escape hatch FloatLand uses for previews: the
 * same denied gradient renders.
 */
export const IgnorePermissions: Story = {
  args: { account: "acc_denied", ignorePermissions: true },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-username");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(
        el.shadowRoot?.querySelector<HTMLElement>(".sk-username__name")?.style.background,
      ).toContain("linear-gradient"),
    );
  },
};

/** A `nova` account with a hex colour: any plain colour is allowed there. */
export const PlainHex: Story = {
  args: { account: "acc_plain_nova" },
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-username");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await step("a hex plain colour renders as-is", async () => {
      await waitFor(() =>
        expect(el.shadowRoot?.querySelector(".sk-username__name")?.textContent).toBe(
          "Hexed",
        ),
      );
      const name = el.shadowRoot?.querySelector<HTMLElement>(".sk-username__name");
      canvasElement.append(swatch("#f97316"));
      await expect(sameColor(name, canvasElement.querySelector("span:last-child"))).toBe(true);
    });
  },
};

/**
 * No custom colour, but an active `nova` subscription: the name gets the
 * tier's default membership colour.
 */
export const MembershipDefault: Story = {
  args: { account: "acc_member" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-username");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector(".sk-username__name")?.textContent).toBe(
        "Member",
      ),
    );
    const name = el.shadowRoot?.querySelector<HTMLElement>(".sk-username__name");
    canvasElement.append(swatch("#39c5bb"));
    await expect(sameColor(name, canvasElement.querySelector("span:last-child"))).toBe(true);
    const mark = el.shadowRoot.querySelector<HTMLElement>('[part="membership"]');
    await expect(mark?.querySelector("title")?.textContent).toBe("Membership · Nova");
    await expect(sameColor(mark, canvasElement.querySelector("span:last-child"))).toBe(true);
  },
};

/** No subscription at all: a custom colour is not allowed, so nothing applies. */
export const Untiered: Story = {
  args: { account: "acc_untiered" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-username");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector(".sk-username__name")?.textContent).toBe(
        "Untiered",
      ),
    );
    const name = el.shadowRoot?.querySelector<HTMLElement>(".sk-username__name");
    await expect(name?.style.color).toBe("");
    await expect(el.shadowRoot.querySelector('[part="membership"]')).toBeNull();
  },
};

/** The seven verification marks, one per `verification.type`. */
export const VerificationMarks: Story = {
  render: () =>
    html`${[0, 1, 2, 3, 4, 5, 6].map(
      (type) =>
        html`<sk-username
          name="Type ${type}"
          verified="${type}"
          verified-title="Verified ${type}"
        ></sk-username>`,
    )}`,
  play: async ({ canvasElement, step }) => {
    const elements = [...canvasElement.querySelectorAll("sk-username")];
    await expect(elements.length).toBe(7);

    await step("each type renders its own mark and colour", async () => {
      const colors = [
        "#14b8a6",
        "#38bdf8",
        "#6366f1",
        "#ef4444",
        "#f97316",
        "#3b82f6",
        "#818cf8",
      ];
      for (const [index, el] of elements.entries()) {
        await waitFor(() =>
          expect(el.shadowRoot?.querySelector('[part="verification"]')).not.toBeNull(),
        );
        const mark = el.shadowRoot?.querySelector<HTMLElement>('[part="verification"]');
        canvasElement.append(swatch(colors[index] ?? "#000"));
        await expect(sameColor(mark, canvasElement.querySelector("span:last-child"))).toBe(true);
        // The geometry differs per type: a mark always draws something.
        await expect(mark?.querySelector("path, circle, rect")).not.toBeNull();
        await expect(mark?.querySelector("title")?.textContent).toBe(`Verified ${index}`);
      }
    });
  },
};

/** An automated account: the bot mark plus an organization verification. */
export const BotAccount: Story = {
  args: { account: "acc_bot" },
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-username");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    const sr = el.shadowRoot;
    await waitFor(() =>
      expect(sr.querySelector('[part="bot"]')).not.toBeNull(),
    );

    await step("the bot mark is inert and titled", async () => {
      const bot = sr.querySelector('[part="bot"]');
      await expect(bot?.querySelector("title")?.textContent).toBe("Automated");
      await expect(bot?.querySelector("rect")).not.toBeNull();
    });

    await step("the verification tooltip carries the API's title and description", async () => {
      const mark = sr.querySelector('[part="verification"]');
      await expect(mark?.querySelector("title")?.textContent).toBe(
        "Organization\nOperated by Solar Network",
      );
    });
  },
};

/**
 * A host that already holds the post passes the author it carries:
 * `el.publisher = post.publisher` renders the name and colour with no request.
 */
export const PublisherProperty: Story = {
  render: () => html`<sk-username id="by-publisher"></sk-username>`,
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-username") as UsernameHandle | null;
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");

    await step("no input at all → the error state", async () => {
      await waitFor(() =>
        expect(el.getAttribute("data-error")).toContain("Missing `account`"),
      );
    });

    await step("the publisher's name and its account's colour apply, with no request", async () => {
      stubState.requests.length = 0;
      el.publisher = {
        id: "p_alice",
        name: "alice",
        nick: "Alice",
        verification: null,
        account: usernameAccountFixture("acc_pink"),
      };
      await waitFor(() =>
        expect(el.shadowRoot?.querySelector(".sk-username__name")?.textContent).toBe(
          "Alice",
        ),
      );
      const name = el.shadowRoot?.querySelector<HTMLElement>(".sk-username__name");
      canvasElement.append(swatch("#ec4899"));
      await expect(sameColor(name, canvasElement.querySelector("span:last-child"))).toBe(true);
      await expect(stubState.requests.length).toBe(0);
    });
  },
};

/** A full account object, also without a request. */
export const AccountProperty: Story = {
  render: () => html`<sk-username id="by-account"></sk-username>`,
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-username") as UsernameHandle | null;
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");

    await step("assigning the account renders the gradient, with no request", async () => {
      stubState.requests.length = 0;
      el.account = usernameAccountFixture("acc_gradient");
      await waitFor(() =>
        expect(el.shadowRoot?.querySelector(".sk-username__name")?.textContent).toBe(
          "BluewhaleTech",
        ),
      );
      const name = el.shadowRoot?.querySelector<HTMLElement>(".sk-username__name");
      await expect(name?.style.background).toContain("linear-gradient");
      await expect(stubState.requests.length).toBe(0);
    });
  },
};

/**
 * Nothing but attributes: `name`/`color`/`tier` (and the gradient form) work
 * without any account behind them.
 */
export const InlineAttributes: Story = {
  render: () => html`
    <sk-username
      name="Nova Fan"
      color="purple"
      tier="solian.stellar.primary"
    ></sk-username>
    <sk-username
      nick="Superfan"
      name="superfan"
      colors="red, blue"
      direction="to right"
      tier="solian.stellar.supernova"
    ></sk-username>
  `,
  play: async ({ canvasElement, step }) => {
    const [plain, gradient] = [...canvasElement.querySelectorAll("sk-username")];
    if (!plain?.shadowRoot || !gradient?.shadowRoot) throw new Error("element not upgraded");
    const plainRoot = plain.shadowRoot;
    const gradientRoot = gradient.shadowRoot;

    await step("a named palette colour plus a tier renders (and shows the star)", async () => {
      await waitFor(() =>
        expect(plainRoot.querySelector(".sk-username__name")?.textContent).toBe(
          "Nova Fan",
        ),
      );
      const name = plainRoot.querySelector<HTMLElement>(".sk-username__name");
      canvasElement.append(swatch("#a855f7"));
      await expect(sameColor(name, canvasElement.querySelector("span:last-child"))).toBe(true);
      await expect(plainRoot.querySelector('[part="membership"]')).not.toBeNull();
    });

    await step("`colors` makes a gradient and `nick` wins over `name`", async () => {
      await waitFor(() =>
        expect(gradientRoot.querySelector(".sk-username__name")?.textContent).toBe(
          "Superfan",
        ),
      );
      const name = gradientRoot.querySelector<HTMLElement>(".sk-username__name");
      await expect(name?.style.background).toContain("to right");
      await expect(name?.style.webkitTextFillColor).toBe("transparent");
    });
  },
};

/** Sizes come from the preset; the element only marks them. */
export const Sizes: Story = {
  render: () => html`
    <sk-username name="Small" size="sm"></sk-username>
    <sk-username name="Medium"></sk-username>
    <sk-username name="Large" size="lg"></sk-username>
    <sk-username name="Unbold" size="lg" bold="false"></sk-username>
  `,
  play: async ({ canvasElement }) => {
    const elements = [...canvasElement.querySelectorAll("sk-username")];
    await waitFor(() =>
      expect(elements[0]?.shadowRoot?.querySelector(".sk-username__name")).not.toBeNull(),
    );
    // The markers sit on the shadow root's row, where the preset reads them.
    const rows = elements.map((el) => el.shadowRoot?.querySelector(".sk-username"));
    await expect(rows.map((row) => row?.getAttribute("data-size"))).toEqual([
      "sm",
      "md",
      "lg",
      "lg",
    ]);
    await expect(rows[3]?.hasAttribute("data-bold")).toBe(false);
    await expect(rows[0]?.hasAttribute("data-bold")).toBe(true);
  },
};

/** A host-supplied `url` makes the element a link, with a cancelable event. */
export const Clickable: Story = {
  args: { account: "acc_pink", url: "https://solian.app/@pinkster" },
  play: async ({ canvasElement, step }) => {
    const el = canvasElement.querySelector("sk-username");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.shadowRoot?.querySelector(".sk-username__name")).not.toBeNull(),
    );

    await step("clicking dispatches `username-click` and opens the url", async () => {
      const originalOpen = window.open;
      const opened: string[] = [];
      window.open = ((url: string) => {
        opened.push(String(url));
        return null;
      }) as unknown as typeof window.open;
      try {
        const fired = new Promise<{ name: string; url: string; composed: boolean }>((resolve) => {
          el.addEventListener(
            "username-click",
            (event) => {
              const e = event as CustomEvent<{ name: string; url: string }>;
              resolve({ name: e.detail.name, url: e.detail.url, composed: e.composed });
            },
            { once: true },
          );
        });
        el.shadowRoot?.querySelector<HTMLElement>(".sk-username__name")?.click();
        const detail = await fired;
        await expect(detail.name).toBe("Pinkster");
        await expect(detail.url).toBe("https://solian.app/@pinkster");
        await expect(detail.composed).toBe(true);
        await expect(opened).toEqual(["https://solian.app/@pinkster"]);
      } finally {
        window.open = originalOpen;
      }
    });

    await step("preventDefault suppresses the default action", async () => {
      const originalOpen = window.open;
      const opened: string[] = [];
      window.open = ((url: string) => {
        opened.push(String(url));
        return null;
      }) as unknown as typeof window.open;
      const cancel = (event: Event) => event.preventDefault();
      el.addEventListener("username-click", cancel);
      try {
        el.shadowRoot?.querySelector<HTMLElement>(".sk-username__name")?.click();
        await expect(opened).toEqual([]);
      } finally {
        el.removeEventListener("username-click", cancel);
        window.open = originalOpen;
      }
    });
  },
};

/** No input at all → inline error state naming every accepted source. */
export const MissingInput: Story = {
  render: () => html`<sk-username></sk-username>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-username");
    if (!el || !el.shadowRoot) throw new Error("element not upgraded");
    await waitFor(() =>
      expect(el.getAttribute("data-error")).toContain("Missing `account`"),
    );
    await expect(el.shadowRoot.querySelector('[part="error"]')).not.toBeNull();
    await expect(el.shadowRoot.querySelector('[part="name"]')).toBeNull();
  },
};

/** The element can be registered under a custom tag via `defineUsername`. */
export const CustomTag: Story = {
  render: (args) => html`
    <sk-demo-username account="${ifDefined(args.account)}"></sk-demo-username>
  `,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("sk-demo-username");
    await waitFor(() =>
      expect(el?.shadowRoot?.querySelector(".sk-username__name")).not.toBeNull(),
    );
  },
};

/**
 * A real account, straight from `api.solian.app`: `parameters.liveApi`
 * forwards the account request to the live API, so `account` can be any real
 * id or name (the default is a public one with a `primary` membership and the
 * palette colour `pink`).
 */
export const LiveAccount: Story = {
  args: { account: "8792577d-407a-44f7-9720-8bad7efdc7a2" },
  parameters: { liveApi: true },
  // No play function, and `!test` keeps the Vitest addon from ever fetching
  // the real API from CI.
  tags: ["!test"],
};

/** The colour rules are exported too, for hosts rendering names themselves. */
export const ExportedHelpers: Story = {
  render: () => html`<div id="helpers"></div>`,
  play: async ({ canvasElement }) => {
    const gradient: SnUsernameColor = {
      type: "gradient",
      colors: ["#39c5bb", "#0081cb"],
      direction: "to bottom",
    };
    await expect(resolveUsernameColor("pink")).toBe("#ec4899");
    await expect(resolveUsernameColor("#abc")).toBe("#abc");
    await expect(canUseUsernameColor(gradient, "solian.stellar.supernova")).toBe(true);
    await expect(canUseUsernameColor(gradient, "solian.stellar.primary")).toBe(false);
    await expect(
      usernameColorStyle({
        usernameColor: gradient,
        perkSubscription: { identifier: "solian.stellar.supernova" },
      }),
    ).toMatchObject({ "-webkit-text-fill-color": "transparent" });
    await expect(canvasElement.querySelector("#helpers")).not.toBeNull();
  },
};
