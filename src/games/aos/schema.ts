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

export const aosCatalogueSchema = z.object({
  ...catalogueSections(),
  units: z.array(aosUnitSchema),
  enhancements: z.array(recordSchema).default([]),
  regiments: z.array(recordSchema).default([]),
}).passthrough();

export const aosPackSchema = cataloguePackSchema("aos", aosCatalogueSchema);

export const aosListSchema = z.object({
  pointsLimit: z.number().positive(),
  factionId: z.string().optional(),
  mode: z.enum(["matched", "casual", "spearhead", "path-to-glory"]).default("matched"),
  generalUnitId: z.string().optional(),
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
export type AosListInput = z.infer<typeof aosListSchema>;
