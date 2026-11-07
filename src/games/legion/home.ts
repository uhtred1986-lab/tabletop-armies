import { listSelections } from "../validation";
import { STANDARD_RANK_LIMITS } from "./validate";
import { legionListSchema } from "./schema";

/**
 * What the Legion world home (layout `field-map`) shows for one saved list: units as order tokens, the command hand
 * and the rank slots. Pure (CLAUDE.md rule 2) and computed per request, nothing stored (rule 3).
 *
 * Rank limits are shown only where the list's own data configures them (a battle force's `rankLimits`, or the
 * `rankLimits` setting for a non-standard mode, or the standard Army's limits exported by `validate.ts`), in the same
 * order the validator reads them.
 */

export const LEGION_RANKS = ["commander", "operative", "corps", "special-forces", "support", "heavy-support"] as const;
export type LegionRank = (typeof LEGION_RANKS)[number];

export interface FieldToken {
  /** Stable React key: row index and unit id. */
  key: string;
  name: string;
  count: number;
  /** null when the unit is not in the list's pack or the pack gives it no rank. */
  rank: LegionRank | null;
  /** Decorative, deterministic offsets in [0, 1): where the token sits inside its map cell. Positions mean nothing. */
  dx: number;
  dy: number;
}

export interface FieldCommandCard {
  id: string;
  /** The card's name from the pack; null when the pack does not have the card. */
  name: string | null;
  pips: number | null;
}

export interface FieldRank {
  rank: LegionRank;
  /** Units in the list at this rank (row counts summed). */
  count: number;
  /** Names of the units at this rank, in list order, without repeats. */
  units: string[];
  /** Only when the list's data configures it; never a guess. */
  limit: { min: number; max: number } | null;
}

export interface LegionFieldMap {
  pointsLimit: number;
  tokens: FieldToken[];
  commandHand: FieldCommandCard[];
  ranks: FieldRank[];
  /** Units whose rank is unknown (not in the pack, or no rank given). */
  unranked: number;
  /** True when every rank has a configured limit. */
  limitsConfigured: boolean;
  /** Whether the pack handed in is the list's own pack (ranks, names and pips come only from it). */
  packKnown: boolean;
}

type Data = Record<string, unknown>;
const data = (value: unknown): Data => value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const rows = (value: unknown): Data[] => Array.isArray(value) ? value.map(data) : [];
const isRank = (value: unknown): value is LegionRank => typeof value === "string" && (LEGION_RANKS as readonly string[]).includes(value);

/** A small integer hash, so a token's place depends only on its index and unit id. */
const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

const validLimit = (value: unknown): { min: number; max: number } | null => {
  const limit = data(value);
  return typeof limit.min === "number" && typeof limit.max === "number" && Number.isFinite(limit.min) && Number.isFinite(limit.max) && limit.min >= 0 && limit.max >= limit.min
    ? { min: limit.min, max: limit.max }
    : null;
};

/**
 * The field map of one list. `pack` is the pack's content when it is the list's own pack, else undefined
 * (the home only has the default pack; another pack's ranks are not guessed). Returns null when the list
 * does not have the Legion shape.
 */
export function legionFieldMap(definition: unknown, pack: unknown): LegionFieldMap | null {
  const envelope = listSelections(definition);
  const parsed = legionListSchema.safeParse(envelope.selections);
  if (!parsed.success) return null;
  const list = parsed.data;
  const content = data(pack);
  const catalogue = data(content.catalogue);
  const units = new Map(rows(catalogue.units).map((unit) => [String(unit.id), unit]));
  const cards = new Map(rows(catalogue.commandCards).map((card) => [String(card.id), card]));

  const tokens: FieldToken[] = list.units.map((selection, index) => {
    const rank = units.get(selection.unitId)?.rank;
    const seed = `${index}:${selection.unitId}`;
    return { key: seed, name: selection.name, count: selection.count, rank: isRank(rank) ? rank : null, dx: hash(`x${seed}`), dy: hash(`y${seed}`) };
  });

  const commandHand: FieldCommandCard[] = list.commandCardIds.map((id) => {
    const card = cards.get(id);
    return { id, name: typeof card?.name === "string" ? card.name : null, pips: typeof card?.pips === "number" ? card.pips : null };
  });

  // Same reading order as validate.ts, including the standard Army's limits from there.
  const modeId = list.modeId ?? "standard";
  const force = list.battleForceId ? rows(catalogue.battleForces).find((f) => String(f.id) === list.battleForceId) : undefined;
  const configured = envelope.settings.rankLimits ?? data(content.constraints).rankLimits;
  let source: Data | undefined;
  if (force) {
    const forceLimits = data(force.rankLimits);
    const forMode = data(forceLimits[modeId] ?? forceLimits);
    source = Object.keys(forMode).length ? forMode : data(configured);
  } else source = modeId === "standard" ? data(STANDARD_RANK_LIMITS) : data(configured);

  const ranks: FieldRank[] = LEGION_RANKS.map((rank) => {
    const at = tokens.filter((token) => token.rank === rank);
    return {
      rank,
      count: at.reduce((n, token) => n + token.count, 0),
      units: [...new Set(at.map((token) => token.name))],
      limit: source ? validLimit(source[rank]) : null,
    };
  });

  return {
    pointsLimit: list.pointsLimit,
    tokens,
    commandHand,
    ranks,
    unranked: tokens.filter((token) => token.rank === null).reduce((n, token) => n + token.count, 0),
    limitsConfigured: ranks.every((rank) => rank.limit !== null),
    packKnown: Object.keys(catalogue).length > 0,
  };
}

/** Diamond slots for one rank: filled for units at the rank, empty up to the maximum when the maximum is known. */
export function rankSlots(rank: FieldRank): boolean[] {
  const total = rank.limit ? Math.max(rank.limit.max, rank.count) : rank.count;
  return Array.from({ length: total }, (_, i) => i < rank.count);
}

/** Painted share in whole percent, or null when there are no models (no number to show). */
export function paintedPercent(painted: number, models: number): number | null {
  return models > 0 ? Math.round((painted / models) * 100) : null;
}
