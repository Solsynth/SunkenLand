/**
 * The platform's reaction set and the symbol normalization every surface that
 * reads `reactions_count` / `reactions_made` needs — `sk-reaction-list` and
 * `sk-post` both render chips from the same catalog.
 *
 * Symbols arrive camelCased from some endpoints (`thumbUp`): the client's
 * snake→camel conversion camelCases the *keys* of those maps too, while the
 * wire expects the canonical `thumb_up` form when reacting. Everything inside
 * the elements therefore works with the canonical form.
 */

import { camelToSnakeStr } from "../api/case";

/** One offerable reaction, with the attitude FloatLand assigns it. */
export interface AvailableReaction {
  symbol: string;
  emoji: string;
  label: string;
  /** 0 positive, 1 neutral, 2 negative. */
  attitude: number;
}

/** FloatLand's reaction set ("positive" 0, "neutral" 1, "negative" 2). */
export const AVAILABLE_REACTIONS: readonly AvailableReaction[] = [
  { symbol: "thumb_up", emoji: "👍", label: "Like", attitude: 0 },
  { symbol: "heart", emoji: "❤️", label: "Love", attitude: 0 },
  { symbol: "clap", emoji: "👏", label: "Clap", attitude: 0 },
  { symbol: "laugh", emoji: "😂", label: "Laugh", attitude: 0 },
  { symbol: "party", emoji: "🎉", label: "Party", attitude: 0 },
  { symbol: "salute", emoji: "🫡", label: "Salute", attitude: 0 },
  { symbol: "pray", emoji: "🙏", label: "Pray", attitude: 1 },
  { symbol: "hello", emoji: "👋", label: "Hello", attitude: 1 },
  { symbol: "shock", emoji: "😱", label: "Shock", attitude: 1 },
  { symbol: "confuse", emoji: "🧐", label: "Confused", attitude: 1 },
  { symbol: "cry", emoji: "😭", label: "Cry", attitude: 1 },
  { symbol: "speechless", emoji: "😶", label: "Speechless", attitude: 1 },
  { symbol: "ridicule", emoji: "😏", label: "Ridicule", attitude: 1 },
  { symbol: "angry", emoji: "😡", label: "Angry", attitude: 2 },
  { symbol: "thumb_down", emoji: "👎", label: "Dislike", attitude: 2 },
];

/** The catalog keyed by canonical symbol. */
export const REACTIONS_BY_SYMBOL: Readonly<Record<string, AvailableReaction>> =
  Object.fromEntries(AVAILABLE_REACTIONS.map((reaction) => [reaction.symbol, reaction]));

/** Canonical (`thumb_up`) form of a symbol the API may send camelCased. */
export function normalizeReactionSymbol(symbol: string): string {
  return camelToSnakeStr(symbol).toLowerCase();
}

/** Canonicalize the keys of a `reactions_count` / `reactions_made` map. */
export function normalizeReactionSymbols<T>(
  map: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [symbol, value] of Object.entries(map)) {
    out[normalizeReactionSymbol(symbol)] = value;
  }
  return out;
}

/** The catalog entry for a symbol (accepting either spelling), if known. */
export function getReaction(symbol: string): AvailableReaction | undefined {
  return REACTIONS_BY_SYMBOL[normalizeReactionSymbol(symbol)];
}

/** A reaction chip: the counts plus whether the visitor reacted. */
export interface ReactionChip {
  symbol: string;
  count: number;
  reacted: boolean;
  label: string;
  emoji: string;
  attitude: number;
}

/**
 * Chips for a `reactions_count` map (optionally with `reactions_made`), in the
 * order the API reports them and with unknown symbols kept as-is.
 */
export function buildReactionChips(
  counts: Record<string, number> | null | undefined,
  mine?: Record<string, boolean> | null,
): ReactionChip[] {
  return Object.entries(counts ?? {}).map(([symbol, count]) => {
    const known = getReaction(symbol);
    return {
      symbol,
      count,
      reacted: Boolean(mine?.[symbol]),
      label: known?.label ?? symbol,
      emoji: known?.emoji ?? "❓",
      attitude: known?.attitude ?? 0,
    };
  });
}

/**
 * A sticker image URL for a symbol from a `{symbol}` template
 * (`https://cdn…/stickers/{symbol}.webp`); `undefined` when no template is
 * configured, which is what makes reactions fall back to emoji.
 */
export function reactionStickerSrc(
  template: string | undefined,
  symbol: string,
): string | undefined {
  if (!template) return undefined;
  return template.replace(/\{symbol\}/g, normalizeReactionSymbol(symbol));
}
