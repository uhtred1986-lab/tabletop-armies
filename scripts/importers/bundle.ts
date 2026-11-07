import { aosPackSchema } from "@/games/aos/schema";
import { bmgPackSchema } from "@/games/bmg/schema";
import { legionPackSchema } from "@/games/legion/schema";
import { mcpPackSchema } from "@/games/mcp/schema";
import { shatterpointPackSchema } from "@/games/shatterpoint/schema";
import type { GameId } from "@/games/types";

const packSchemas = {
  aos: aosPackSchema,
  mcp: mcpPackSchema,
  legion: legionPackSchema,
  shatterpoint: shatterpointPackSchema,
  bmg: bmgPackSchema,
} as const;

const sections: Record<string, string> = {
  factions: "faction",
  units: "unit",
  abilities: "ability",
  cards: "card",
  modes: "mode",
  scenarios: "scenario",
  enhancements: "enhancement",
  regiments: "regiment",
  crises: "crisis",
  affiliations: "affiliation",
  teamTactics: "team-tactic",
  upgrades: "upgrade",
  stances: "stance",
  objectives: "objective",
  orderCards: "order-card",
  commandCards: "command-card",
  battleForces: "battle-force",
  equipment: "equipment",
  objectiveCards: "objective-card",
  starterBoxes: "starter-box",
  spearheads: "spearhead",
};

export type ImportCandidateDraft = {
  entityKind: string;
  sourceId: string;
  proposed: Record<string, unknown>;
  matchTargetId?: string;
  matchConfidence?: number;
};

export function createImportBundle(raw: unknown) {
  if (!raw || typeof raw !== "object" || !("gameId" in raw)) throw new Error("Import input must be a CataloguePack object");
  const gameId = (raw as { gameId: GameId }).gameId;
  const schema = packSchemas[gameId];
  if (!schema) throw new Error("Import game is unsupported");
  const pack = schema.parse(raw);
  const catalogue = pack.catalogue as Record<string, unknown>;
  const candidates: ImportCandidateDraft[] = [];
  const sourceKeys = new Set<string>();
  for (const [section, entityKind] of Object.entries(sections)) {
    const records = catalogue[section];
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      if (!record || typeof record !== "object" || typeof (record as Record<string, unknown>).id !== "string" || typeof (record as Record<string, unknown>).name !== "string") {
        throw new Error(`${section} records need string id and name fields`);
      }
      const value = record as Record<string, unknown>;
      const sourceId = typeof value.sourceId === "string" && value.sourceId ? value.sourceId : value.id as string;
      const key = `${entityKind}\0${sourceId}`;
      if (sourceKeys.has(key)) throw new Error(`Duplicate ${entityKind} source id: ${sourceId}`);
      sourceKeys.add(key);
      candidates.push({ entityKind, sourceId, proposed: value });
    }
  }
  // Preserve only explicit, one-to-one card ownership already present in the
  // catalogue. Never guess a link from a card or figure name.
  const units = Array.isArray(catalogue.units) ? catalogue.units as Array<Record<string, unknown>> : [];
  const cards = Array.isArray(catalogue.cards) ? catalogue.cards as Array<Record<string, unknown>> : [];
  for (const card of cards) {
    const explicitTargets = new Set<string>();
    for (const unit of units) {
      if (Array.isArray(unit.cardIds) && unit.cardIds.includes(card.id)) explicitTargets.add(String(unit.id));
    }
    if (typeof card.associatedUnitId === "string") explicitTargets.add(card.associatedUnitId);
    if (explicitTargets.size !== 1) continue;
    const [targetId] = explicitTargets;
    if (!targetId || !units.some((unit) => unit.id === targetId)) continue;
    const sourceId = typeof card.sourceId === "string" && card.sourceId ? card.sourceId : String(card.id);
    const candidate = candidates.find((row) => row.entityKind === "card" && row.sourceId === sourceId);
    if (candidate) {
      candidate.matchTargetId = targetId;
      candidate.matchConfidence = 1;
    }
  }
  return {
    schemaVersion: 1 as const,
    pack,
    candidates,
    report: {
      totalCandidates: candidates.length,
      byEntityKind: Object.fromEntries([...new Set(candidates.map(({ entityKind }) => entityKind))].map((entity) => [entity, candidates.filter((candidate) => candidate.entityKind === entity).length])),
      packDraft: {
        schemaVersion: pack.schemaVersion,
        gameId: pack.gameId,
        packId: pack.packId,
        revision: pack.revision,
        publishedAt: pack.publishedAt,
        importedAt: pack.importedAt,
        provenance: pack.provenance,
        assets: pack.assets,
        constraints: pack.constraints,
      },
    },
  };
}

export function validateCataloguePack(raw: unknown) {
  if (!raw || typeof raw !== "object" || !("gameId" in raw)) throw new Error("CataloguePack is required");
  const gameId = (raw as { gameId: GameId }).gameId;
  const schema = packSchemas[gameId];
  if (!schema) throw new Error("Import game is unsupported");
  return schema.parse(raw);
}
