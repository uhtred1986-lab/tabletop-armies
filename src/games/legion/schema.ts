import { z } from "zod";
import { cataloguePackSchema, catalogueSections, recordSchema } from "../catalogue";

export const legionUnitSchema = recordSchema.extend({
  factionIds: z.array(z.string()).optional(),
  rank: z.enum(["commander", "operative", "corps", "special-forces", "support", "heavy-support"]).optional(),
  points: z.number().nonnegative().optional(),
  unique: z.boolean().optional(),
  upgradeBar: z.record(z.string(), z.number().int().nonnegative()).optional(),
  upgradeSlotIds: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
}).passthrough();

export const legionCatalogueSchema = z.object({
  ...catalogueSections(),
  units: z.array(legionUnitSchema),
  upgrades: z.array(recordSchema.extend({ points: z.number().nonnegative().optional(), slot: z.string().optional() })).default([]),
  commandCards: z.array(recordSchema).default([]),
  battleForces: z.array(recordSchema).default([]),
}).passthrough();

export const legionPackSchema = cataloguePackSchema("legion", legionCatalogueSchema);

export const legionListSchema = z.object({
  modeId: z.string().optional(),
  factionId: z.string().optional(),
  battleForceId: z.string().optional(),
  pointsLimit: z.number().positive(),
  commandCardIds: z.array(z.string()).default([]),
  units: z.array(z.object({
    unitId: z.string().min(1),
    name: z.string().min(1),
    count: z.number().int().positive().default(1),
    upgrades: z.array(z.object({ slot: z.string(), upgradeId: z.string() }).strict()).default([]),
  }).strict()).default([]),
}).strict();

export type LegionCatalogue = z.infer<typeof legionCatalogueSchema>;
export type LegionList = z.infer<typeof legionListSchema>;
