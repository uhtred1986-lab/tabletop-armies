import type { GameId, HomeLayout, Issue, ReadyMadeOption, WorldId } from "@/games/types";

/**
 * What every world home receives (docs/ui-standard.md §3, "World homes"). Read from the owner's database by
 * `load.ts`; everything here is computed for this request, nothing is stored (CLAUDE.md rule 3).
 */
export interface HomeFaction {
  /** The faction name as the owner wrote it on the collection rows; "" when no faction was entered. */
  name: string;
  models: number;
  /** Models at the last (painted) paint stage. */
  painted: number;
}

export interface HomeList {
  id: number;
  name: string;
  /** ISO timestamp of the last change. */
  updatedAt: string;
  packId: number | null;
  /** The game module's list shape, as saved. Each world reads it through its own game module. */
  definition: Record<string, unknown>;
  status: "complete" | "incomplete";
  issues: Issue[];
}

export interface HomeGame {
  id: number;
  opponent: string | null;
  /** ISO date (YYYY-MM-DD). */
  playedOn: string;
  /** null while the game is still running. */
  result: "win" | "loss" | "draw" | null;
}

export interface HomeData {
  game: { id: GameId; world: WorldId; nameKey: string; factionLabelKey: string; homeLayout: HomeLayout };
  locale: "de" | "en";
  totals: { models: number; painted: number; units: number };
  /** Largest first. */
  factions: HomeFaction[];
  /** Most recently changed first, at most six. */
  lists: HomeList[];
  /** The pack new lists use by default (src/lib/lists/default-pack.ts), if any. */
  pack?: { id: number; content: unknown };
  /** Ready-made armies the default pack offers (AoS Spearhead); empty for other games or without a pack. */
  readyMade: ReadyMadeOption[];
  /** Newest first, at most five. */
  recentGames: HomeGame[];
  /** A game still running (no result yet), newest. */
  activeGame?: HomeGame;
}
