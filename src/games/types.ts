// The one interface every game module implements (docs/architecture/game-modules.md).
// Nothing outside src/games/ branches on a game id; it asks the module instead.

export type GameId = "aos" | "mcp" | "legion" | "shatterpoint" | "bmg";
export type WorldId = "sigmar" | "crisis" | "legion" | "saga" | "gotham";

export type Severity = "error" | "warning" | "info";

/** One validation result. `message` and `allowed` are i18n keys plus values, never hand-written text. */
export interface Issue {
  rule: string;
  severity: Severity;
  messageKey: string;
  values?: Record<string, string | number>;
}

/** A pure list rule: no Dexie, React or network (CLAUDE.md rule 2). */
export type Rule<List, Pack, Settings = unknown> = (list: List, pack: Pack, settings: Settings) => Issue[];

export interface Phase {
  id: string;
  /** i18n key of the phase name, in the game's own rulebook words. */
  labelKey: string;
}

export interface GameModule {
  id: GameId;
  world: WorldId;
  /** i18n key: the game's name. */
  nameKey: string;
  /** i18n key: what this game calls a faction (faction, affiliation, era). */
  factionLabelKey: string;
  /** Rounds in a standard game, if fixed. */
  rounds?: number;
  /** Phases of one turn or round, in order. */
  phases: Phase[];
}

export const runRules = <L, P, S>(rules: Rule<L, P, S>[], list: L, pack: P, settings: S): Issue[] =>
  rules.flatMap((rule) => rule(list, pack, settings));
