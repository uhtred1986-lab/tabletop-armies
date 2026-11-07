// The one interface every game module implements (docs/architecture/game-modules.md).
// Nothing outside src/games/ branches on a game id; it asks the module instead.

export type GameId = "aos" | "mcp" | "legion" | "shatterpoint" | "bmg";
export type WorldId = "sigmar" | "crisis" | "legion" | "saga" | "gotham";

export type Severity = "error" | "warning" | "info";

export interface DataProvenance {
  kind: "owner-import" | "manual" | "owner-override";
  sourceName?: string;
  sourceUrl?: string;
  sourceDate?: string;
  importedAt?: string;
  note?: string;
}

export interface CatalogueAsset {
  id: string;
  kind: "card" | "token" | "reference" | "other";
  /** Private storage key or owner-provided URL; assets themselves are never bundled in source. */
  ref: string;
  mimeType?: string;
  sourceUrl?: string;
  sourceDate?: string;
}

/** Versioned, replaceable catalogue envelope. Game modules own the catalogue shape. */
export interface CataloguePack<Catalogue = unknown> {
  schemaVersion: 1;
  gameId: GameId;
  packId: string;
  revision: string;
  publishedAt?: string;
  importedAt: string;
  provenance: DataProvenance[];
  assets: CatalogueAsset[];
  catalogue: Catalogue;
  /** Explicit game/season constraints supplied by the owner or an import. */
  constraints: Record<string, unknown>;
}

/** Persisted builder input. Totals and remaining budgets are always derived. */
export interface ListDefinition<Selections = unknown> {
  schemaVersion: 1;
  gameId: GameId;
  id?: string;
  name: string;
  modeId?: string;
  factionId?: string;
  dataPackId: string;
  selections: Selections;
  settings?: Record<string, unknown>;
}

export interface OwnerCollectionSnapshot {
  /** Catalogue IDs that the owner has at least one model of. */
  ownedUnitIds: readonly string[];
  /** Number of owned models per catalogue unit, supplied by collection lookup. */
  unitCounts?: Readonly<Record<string, number>>;
  /** Unit IDs for which every owned model is at the configured painted stage. */
  paintedUnitIds?: readonly string[];
  paintedModelCounts?: Readonly<Record<string, number>>;
}

export interface ListValidationSettings {
  collection?: OwnerCollectionSnapshot;
  /** Season, format and battle-force limits are explicit inputs, never hidden defaults. */
  constraints?: Readonly<Record<string, unknown>>;
}

export interface ListFieldDefinition {
  path: string;
  labelKey: string;
  control: "text" | "number" | "boolean" | "select" | "unit-picker" | "faction-picker" | "card-picker" | "multi-unit-picker" | "repeater";
  optionsSource?: "units" | "factions" | "abilities" | "cards" | "modes" | "scenarios" | "battleForces" | "teamTactics" | "upgrades" | "enhancements" | "crises" | "objectives" | "equipment";
  required?: boolean;
  itemFields?: ListFieldDefinition[];
  /** Fixed choices (for a "select") named by i18n keys, when the value is a schema enum rather than a pack record. */
  choices?: { id: string; labelKey: string }[];
}

export interface ListSettingsFieldDefinition {
  path: string;
  labelKey: string;
  control: "text" | "number" | "boolean" | "select" | "json";
  required?: boolean;
  optionsSource?: ListFieldDefinition["optionsSource"];
}

export interface ListBuilderVariant {
  id: string;
  labelKey: string;
  schema: import("zod").ZodType;
  selectionsSchema: import("zod").ZodType;
  fields: ListFieldDefinition[];
  settingsFields: ListSettingsFieldDefinition[];
  manual: true;
  validateList: (list: unknown, pack: unknown, settings: ListValidationSettings) => ListValidationResult;
  /** Optional ready-made armies from the selected pack (AoS Spearhead). The shell asks this, never a game id. */
  readyMade?: ReadyMadeSource;
}

/** One ready-made army offered by a pack, as the list builder's picker shows it. */
export interface ReadyMadeOption {
  id: string;
  name: string;
  factionName?: string;
  unitCount: number;
  /** False while any section of the army is unconfigured or incomplete in the owner's pack. */
  configured: boolean;
}

/** Pure hooks a variant offers to start a list from a ready-made army in the selected pack. */
export interface ReadyMadeSource {
  /** Selection path and value that switch the picker on (for AoS: `selections.mode` = `spearhead`). */
  when: { path: string; value: string };
  /** Selection path that holds the chosen army's id. */
  selectedPath: string;
  /** i18n keys of the picker's words. */
  labelKeys: { title: string; help: string; empty: string; noPack: string; dataLink: string; units: string; configured: string; incomplete: string; noFaction: string; replaceConfirm: string; unlinked: string };
  options: (pack: unknown) => ReadyMadeOption[];
  /** New selections for the chosen army, or undefined when the pack does not hold it. */
  apply: (pack: unknown, id: string) => { selections: Record<string, unknown>; unlinkedCount: number } | undefined;
}

export interface TrackerDefinition {
  id: string;
  labelKey: string;
  kind: "counter" | "toggle" | "resource" | "track";
  scope: "game" | "side" | "unit" | "round";
  min?: number;
  max?: number;
  derived?: boolean;
  options?: { id: string; labelKey: string }[];
}

export interface ListValidationResult {
  issues: Issue[];
  status: "complete" | "incomplete";
}

/** One validation result. `message` and `allowed` are i18n keys plus values, never hand-written text. */
export interface Issue {
  rule: string;
  severity: Severity;
  messageKey: string;
  values?: Record<string, string | number>;
  path?: string;
  /** True when a missing rules/configuration input prevents a complete legality decision. */
  preventsCompleteValidation?: boolean;
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
  /** UI schema and pure validator, injected per game so the shell remains game-agnostic. */
  listBuilder?: {
    schema: import("zod").ZodType;
    fields: ListFieldDefinition[];
    settingsFields: ListSettingsFieldDefinition[];
    manual: true;
    variants?: ListBuilderVariant[];
    validateList: (list: unknown, pack: unknown, settings: ListValidationSettings) => ListValidationResult;
  };
  /** Trackers displayed by the game-specific table UI. */
  trackers?: TrackerDefinition[];
  /** Capability flags used to show game-specific action panels without game-id branches. */
  playTools?: { orderDeck?: boolean; struggleTrack?: boolean };
}

export const runRules = <L, P, S>(rules: Rule<L, P, S>[], list: L, pack: P, settings: S): Issue[] =>
  rules.flatMap((rule) => rule(list, pack, settings));
