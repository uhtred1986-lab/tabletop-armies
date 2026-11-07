import { z } from "zod";
import { cataloguePackSchema, catalogueSections, recordSchema } from "../catalogue";

export const aosUnitSchema = recordSchema.extend({
  factionId: z.string().optional(),
  role: z.enum(["hero", "unit", "terrain", "manifestation", "other"]).optional(),
  points: z.number().nonnegative().optional(),
  minSize: z.number().positive().optional(),
  maxSize: z.number().positive().optional(),
  reinforcedSize: z.number().positive().optional(),
  unique: z.boolean().optional(),
  legends: z.boolean().optional(),
  legendsDate: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  regimentOptionIds: z.array(z.string()).optional(),
  regimentHeroIds: z.array(z.string()).optional(),
  allowedEnhancementIds: z.array(z.string()).optional(),
}).passthrough();

/**
 * Whether the owner has entered a ready-made army's section. Nothing is inferred: a section stays
 * "unconfigured" until the owner enters it from their own source, and "incomplete" while partly entered.
 */
export const spearheadSectionStatusSchema = z.enum(["configured", "incomplete", "unconfigured"]);

export const spearheadSectionKeys = ["units", "battleTraits", "regimentAbilities", "enhancements"] as const;
export type SpearheadSectionKey = typeof spearheadSectionKeys[number];

export const aosSpearheadUnitSchema = z.object({
  /** Catalogue unit this box unit uses; absent until the owner links it. */
  unitId: z.string().min(1).optional(),
  name: z.string().min(1),
  modelCount: z.number().int().positive(),
  isGeneral: z.boolean().optional(),
  notes: z.string().optional(),
}).strict();

/** A ready-made Spearhead army, entered only from the owner's own source (private pack, never the repo). */
export const aosSpearheadSchema = recordSchema.extend({
  factionId: z.string().min(1).optional(),
  source: z.object({
    title: z.string().min(1),
    /** Only a date printed on the source; never a download or import date. */
    printedDate: z.string().optional(),
    kind: z.enum(["owner-scan", "manual"]),
  }).strict(),
  units: z.array(aosSpearheadUnitSchema).default([]),
  battleTraits: z.array(recordSchema).default([]),
  regimentAbilities: z.array(recordSchema).default([]),
  enhancements: z.array(recordSchema).default([]),
  sections: z.object({
    units: spearheadSectionStatusSchema.default("unconfigured"),
    battleTraits: spearheadSectionStatusSchema.default("unconfigured"),
    regimentAbilities: spearheadSectionStatusSchema.default("unconfigured"),
    enhancements: spearheadSectionStatusSchema.default("unconfigured"),
  }).strict().prefault({}),
}).passthrough().refine((spearhead) => spearhead.sections.units !== "configured" || spearhead.units.length > 0, "A configured unit section needs at least one unit")
  .refine((spearhead) => spearhead.units.filter((unit) => unit.isGeneral).length <= 1, "A spearhead flags at most one general");

export const aosCatalogueSchema = z.object({
  ...catalogueSections(),
  units: z.array(aosUnitSchema),
  enhancements: z.array(recordSchema).default([]),
  regiments: z.array(recordSchema).default([]),
  spearheads: z.array(aosSpearheadSchema).default([]),
}).passthrough();

export const aosPackSchema = cataloguePackSchema("aos", aosCatalogueSchema);

export const aosListSchema = z.object({
  /** Required outside Spearhead (validator); a ready-made Spearhead has a fixed composition instead. */
  pointsLimit: z.number().positive().optional(),
  factionId: z.string().optional(),
  mode: z.enum(["matched", "casual", "spearhead", "path-to-glory"]).default("matched"),
  generalUnitId: z.string().optional(),
  /** The ready-made army a "spearhead" list was started from (catalogue.spearheads[].id). */
  spearheadId: z.string().min(1).optional(),
  entries: z.array(z.object({
    unitId: z.string().min(1),
    name: z.string().min(1),
    regimentId: z.string().optional(),
    enhancementIds: z.array(z.string()).default([]),
    reinforced: z.boolean().default(false),
    isAuxiliary: z.boolean().default(false),
    size: z.number().positive().optional(),
    isGeneral: z.boolean().default(false),
  }).strict()).default([]),
}).strict();

export type AosCatalogue = z.infer<typeof aosCatalogueSchema>;
export type AosSpearhead = z.infer<typeof aosSpearheadSchema>;
export type AosSpearheadUnit = z.infer<typeof aosSpearheadUnitSchema>;
export type AosListInput = z.infer<typeof aosListSchema>;
