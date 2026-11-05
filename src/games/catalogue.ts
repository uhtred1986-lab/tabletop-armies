import { z } from "zod";
import type { CataloguePack, GameId } from "./types";

export const provenanceSchema = z.object({
  kind: z.enum(["owner-import", "manual", "owner-override"]),
  sourceName: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceDate: z.string().optional(),
  importedAt: z.string().optional(),
  note: z.string().optional(),
}).strict();

export const catalogueAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["card", "token", "reference", "other"]),
  ref: z.string().min(1),
  mimeType: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceDate: z.string().optional(),
}).strict();

/** Every pack remains game-specific internally while sharing a validated versioned envelope. */
export const cataloguePackSchema = <T extends z.ZodType>(gameId: GameId, catalogue: T) => z.object({
  schemaVersion: z.literal(1),
  gameId: z.literal(gameId),
  packId: z.string().min(1),
  revision: z.string().min(1),
  publishedAt: z.string().optional(),
  importedAt: z.string().min(1),
  provenance: z.array(provenanceSchema),
  assets: z.array(catalogueAssetSchema),
  catalogue,
  constraints: z.record(z.string(), z.unknown()),
}).strict();

/** Shared versioned persistence envelope for each game-specific builder selection schema. */
export const listDefinitionSchema = <T extends z.ZodType>(gameId: GameId, selections: T) => z.object({
  schemaVersion: z.literal(1),
  gameId: z.literal(gameId),
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  modeId: z.string().optional(),
  factionId: z.string().optional(),
  dataPackId: z.string().min(1),
  selections,
  settings: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const recordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provenance: z.array(z.number().int().nonnegative()).optional(),
  assetIds: z.array(z.string().min(1)).optional(),
}).passthrough();

/** Owner-entered/source-backed scenarios and special modes remain readable without rule automation. */
export const modeScenarioRecordSchema = recordSchema.extend({
  /** Parent special mode for a scenario/mission record. */
  modeId: z.string().optional(),
  /** Stable type tag such as event, mission, encounter, campaign, or operation. */
  scenarioType: z.string().optional(),
  modeType: z.string().optional(),
  gameId: z.enum(["aos", "mcp", "legion", "shatterpoint", "bmg"]).optional(),
  sourceUrl: z.string().url().optional(),
  sourceDate: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([]),
  sections: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    text: z.string(),
    sourcePages: z.array(z.number().int().positive()).optional(),
    sourceRef: z.string().optional(),
  }).passthrough()).default([]),
  figureSuggestions: z.array(z.object({
    unitId: z.string().optional(),
    figureName: z.string().optional(),
    matchTargetId: z.string().nullable().optional(),
    rationale: z.string().optional(),
    sourceRef: z.string().optional(),
    strength: z.enum(["required", "suggested"]).optional(),
  }).passthrough().refine((suggestion) => Boolean(suggestion.unitId || suggestion.figureName), "A figure suggestion needs a resolved unit or source figure name" )).default([]),
  missingSections: z.array(z.string()).default([]),
  reviewFlags: z.array(z.string()).default([]),
}).passthrough();

export const catalogueSections = <R extends z.ZodType = typeof recordSchema>(record: R = recordSchema as unknown as R) => ({
  factions: z.array(record),
  units: z.array(record),
  abilities: z.array(record),
  cards: z.array(record),
  modes: z.array(modeScenarioRecordSchema),
  scenarios: z.array(modeScenarioRecordSchema),
});

export type CatalogueRecord = z.infer<typeof recordSchema> & Record<string, unknown>;
export type CatalogueSections = {
  factions: CatalogueRecord[];
  units: CatalogueRecord[];
  abilities: CatalogueRecord[];
  cards: CatalogueRecord[];
  modes: CatalogueRecord[];
  scenarios: CatalogueRecord[];
};

export type AnyCataloguePack<C = unknown> = CataloguePack<C>;
