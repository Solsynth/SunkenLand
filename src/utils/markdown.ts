/**
 * Minimal, dependency-free Markdown renderer for reply content.
 *
 * FloatLand renders reply bodies with markdown-it (`html: false, breaks: true,
 * linkify: true`) plus Solian-specific plugins. Embedded widgets should stay
 * small, so this covers the common subset — headings, paragraphs, line breaks,
 * blockquotes, lists, fenced code, inline code, bold, italic, strikethrough,
 * and links — with the same security posture: HTML is always escaped and link
 * targets are restricted to http(s)/mailto.
 *
 * Markdown-it parity gaps (intentional): no raw HTML (same as FloatLand),
 * no nested block structures (lists inside blockquotes etc.), no intraword
 * `_emphasis_` (only `*`).
 */

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPE[ch] ?? ch);
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/`/g, "&#96;");
}

/** Only http(s) and mailto targets pass; everything else renders as text. */
function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed) && !/[\s"'<>]/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

const INLINE_RE =
  /(`+)([^`]+?)\1|(\*\*|__)(.+?)\3|~~(.+?)~~|(\*)(.+?)\6|\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * Render one inline match to HTML. Every captured text run is escaped before it
 * is wrapped, so nothing a post contains can become markup.
 */
function renderInlineMatch(match: RegExpExecArray): string {
  const [
    ,
    codeDelim,
    codeText,
    strongDelim,
    strongText,
    strikeText,
    emDelim,
    emText,
    linkText,
    linkUrl,
  ] = match;
  if (codeDelim) return `<code>${escapeHtml(codeText ?? "")}</code>`;
  if (strongDelim) return `<strong>${renderInline(strongText ?? "")}</strong>`;
  if (strikeText !== undefined) return `<del>${renderInline(strikeText)}</del>`;
  if (emDelim) return `<em>${renderInline(emText ?? "")}</em>`;
  const url = linkUrl === undefined ? null : safeUrl(linkUrl);
  if (!url) return escapeHtml(linkText ?? "");
  return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${renderInline(linkText ?? "")}</a>`;
}

/**
 * Inline Markdown pass. Text *between* constructs is escaped too — otherwise a
 * post body could smuggle raw HTML through an unmatched run
 * (`<img onerror=…>`), which is exactly what `html: false` prevents upstream.
 */
function renderInline(text: string): string {
  let out = "";
  let last = 0;
  // `matchAll` iterates over its own clone of the regex, so the recursion above
  // cannot disturb this loop's position.
  for (const match of text.matchAll(INLINE_RE)) {
    out += escapeHtml(text.slice(last, match.index));
    out += renderInlineMatch(match as RegExpExecArray);
    last = match.index + match[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const UL_ITEM_RE = /^[-*]\s+(.*)$/;
const OL_ITEM_RE = /^\d+\.\s+(.*)$/;
const FENCE_RE = /^```(\w*)\s*$/;

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    const fence = line.match(FENCE_RE);
    if (fence) {
      const lang = fence[1] ?? "";
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
        code.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing fence
      const attrs = lang ? ` class="language-${escapeAttr(lang)}"` : "";
      out.push(
        `<pre><code${attrs}>${escapeHtml(code.join("\n"))}</code></pre>`,
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = (heading[1] ?? "").length;
      out.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
      i++;
      continue;
    }

    const quote = line.match(QUOTE_RE);
    if (quote) {
      const block: string[] = [quote[1] ?? ""];
      i++;
      while (i < lines.length) {
        const next = lines[i]?.match(QUOTE_RE);
        if (!next) break;
        block.push(next[1] ?? "");
        i++;
      }
      out.push(`<blockquote><p>${renderInline(block.join("\n"))}</p></blockquote>`);
      continue;
    }

    const ulItem = line.match(UL_ITEM_RE);
    const olItem = line.match(OL_ITEM_RE);
    if (ulItem || olItem) {
      const ordered = Boolean(olItem);
      const items: string[] = [];
      while (i < lines.length) {
        const match = lines[i]?.match(ordered ? OL_ITEM_RE : UL_ITEM_RE);
        if (!match) break;
        items.push(match[1] ?? "");
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(
        `<${tag}><li>${items
          .map((item) => renderInline(item))
          .join("</li><li>")}</li></${tag}>`,
      );
      continue;
    }

    // Paragraph; blank line or any block start ends it. `breaks: true` matches
    // FloatLand's markdown-it config.
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (
        next.trim() === "" ||
        FENCE_RE.test(next) ||
        HEADING_RE.test(next) ||
        QUOTE_RE.test(next) ||
        UL_ITEM_RE.test(next) ||
        OL_ITEM_RE.test(next)
      ) {
        break;
      }
      para.push(next);
      i++;
    }
    out.push(`<p>${renderInline(para.join("\n")).replace(/\n/g, "<br>")}</p>`);
  }

  return out.join("\n");
}
