import type { Issue } from "../types";
import { listSelections } from "../validation";
import { fundingFor } from "./index";
import { bmgCrewSchema } from "./schema";

/**
 * What the gotham home (case file, docs/ui-standard.md §3) shows of one crew. Pure: computed from the saved list
 * shape and its data pack for this request, never stored (CLAUDE.md rules 2 and 3). A number the pack does not
 * hold stays `null`; a total is only given when every part of it is known.
 */
export type CaseRank = "leader" | "sidekick" | "free-agent" | "henchman" | "vehicle";

export interface CaseRosterRow {
  /** Stable React key: position in the crew plus the model id. */
  key: string;
  modelId: string;
  /** The model's name from the pack; null when the pack is missing or does not hold the model. */
  name: string | null;
  rank: CaseRank | null;
  rep: number | null;
  /** The model's own funding plus its chosen equipment; null when any part is missing from the pack. */
  funding: number | null;
}

export interface CaseFileSummary {
  /** True when the saved list matches the crew shape; false leaves everything below empty. */
  readable: boolean;
  rows: CaseRosterRow[];
  repLimit: number | null;
  repUsed: number | null;
  fundingLimit: number | null;
  fundingUsed: number | null;
  /** fundingLimit − fundingUsed; negative when the crew is over budget. */
  fundingLeft: number | null;
  deckCards: number;
}

export type PinTone = "ok" | "warn" | "danger" | "info";

export interface CasePin {
  tone: PinTone;
  messageKey: string;
  values?: Record<string, string | number>;
}

type Data = Record<string, unknown>;
const data = (value: unknown): Data => value && typeof value === "object" ? value as Data : {};
const rows = (value: unknown): Data[] => Array.isArray(value) ? value.map(data) : [];
const RANKS: readonly CaseRank[] = ["leader", "sidekick", "free-agent", "henchman", "vehicle"];
const asRank = (value: unknown): CaseRank | null => RANKS.includes(value as CaseRank) ? value as CaseRank : null;
const sumKnown = (values: (number | null)[]): number | null => values.some((v) => v === null) ? null : values.reduce<number>((n, v) => n + (v ?? 0), 0);

const EMPTY: CaseFileSummary = { readable: false, rows: [], repLimit: null, repUsed: null, fundingLimit: null, fundingUsed: null, fundingLeft: null, deckCards: 0 };

/** The roster and the derived Rep and funding totals of one saved crew, read against its pack (or none). */
export function caseFileSummary(definition: unknown, packContent: unknown): CaseFileSummary {
  const parsed = bmgCrewSchema.safeParse(listSelections(definition).selections);
  if (!parsed.success) return EMPTY;
  const crew = parsed.data;
  const catalogue = data(data(packContent).catalogue);
  const models = new Map(rows(catalogue.units).map((m) => [String(m.id), m]));
  const equipment = new Map(rows(catalogue.equipment).map((e) => [String(e.id), e]));

  const roster: CaseRosterRow[] = crew.models.map((selection, index) => {
    const model = models.get(selection.modelId);
    const printed = model ? (Array.isArray(model.ranks) ? model.ranks.map(asRank) : [asRank(model.rank)]).filter((r): r is CaseRank => r !== null) : [];
    const own = model && typeof model.funding === "number" ? model.funding : null;
    const gear = selection.equipmentIds.map((id) => {
      const item = equipment.get(id);
      return item && typeof item.funding === "number" ? item.funding : null;
    });
    return {
      key: `${index}-${selection.modelId}`,
      modelId: selection.modelId,
      name: model && typeof model.name === "string" ? model.name : null,
      rank: selection.rank ?? printed[0] ?? null,
      rep: model && typeof model.reputation === "number" ? model.reputation : null,
      funding: sumKnown([own, ...gear]),
    };
  });

  const fundingLimit = fundingFor(crew.repLimit);
  const fundingUsed = sumKnown(roster.map((r) => r.funding));
  return {
    readable: true,
    rows: roster,
    repLimit: crew.repLimit,
    repUsed: sumKnown(roster.map((r) => r.rep)),
    fundingLimit,
    fundingUsed,
    fundingLeft: fundingUsed === null ? null : fundingLimit - fundingUsed,
    deckCards: crew.objectiveCardIds.length,
  };
}

const TONE: Record<Issue["severity"], PinTone> = { error: "danger", warning: "warn", info: "info" };
const ORDER: Record<PinTone, number> = { danger: 0, warn: 1, info: 2, ok: 3 };

/**
 * The validator's findings as index cards for the corkboard, worst first. A crew with no findings and a complete
 * check gets one "in order" card; a crew without findings but an incomplete check gets none (nothing to claim).
 */
export function casePins(issues: Issue[], status: "complete" | "incomplete"): CasePin[] {
  if (issues.length === 0) return status === "complete" ? [{ tone: "ok", messageKey: "home.casefile.pin.allClear" }] : [];
  return issues
    .map((issue, index) => ({ index, pin: { tone: TONE[issue.severity], messageKey: issue.messageKey, values: issue.values } }))
    .sort((a, b) => ORDER[a.pin.tone] - ORDER[b.pin.tone] || a.index - b.index)
    .map(({ pin }) => pin);
}
