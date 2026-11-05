import { z } from "zod";
import { cataloguePackSchema, catalogueSections, recordSchema } from "../catalogue";

export const bmgModelSchema = recordSchema.extend({
  reputation: z.number().nonnegative().optional(),
  funding: z.number().nonnegative().optional(),
  rank: z.enum(["leader", "sidekick", "free-agent", "henchman", "vehicle"]).optional(),
  ranks: z.array(z.enum(["leader", "sidekick", "free-agent", "henchman", "vehicle"])).optional(),
  unique: z.boolean().optional(),
  affiliationIds: z.array(z.string()).optional(),
  rivalIds: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  equipmentSlotIds: z.array(z.string()).optional(),
  objectiveCardIds: z.array(z.string()).optional(),
}).passthrough();

export const bmgCatalogueSchema = z.object({
  ...catalogueSections(),
  units: z.array(bmgModelSchema),
  equipment: z.array(recordSchema.extend({ funding: z.number().nonnegative().optional(), slot: z.string().optional() })).default([]),
  objectiveCards: z.array(recordSchema.extend({ copies: z.number().int().positive().optional(), subtitle: z.string().optional() })).default([]),
  affiliations: z.array(recordSchema).default([]),
}).passthrough();

export const bmgPackSchema = cataloguePackSchema("bmg", bmgCatalogueSchema);

export const bmgCrewSchema = z.object({
  affiliationId: z.string().optional(),
  repLimit: z.number().positive(),
  models: z.array(z.object({ modelId: z.string(), rank: z.enum(["leader", "sidekick", "free-agent", "henchman", "vehicle"]).optional(), equipmentIds: z.array(z.string()).default([]) }).strict()).default([]),
  objectiveCardIds: z.array(z.string()).default([]),
  specialObjectiveCardIds: z.array(z.string()).default([]),
});

export type BmgCatalogue = z.infer<typeof bmgCatalogueSchema>;
export type BmgCrew = z.infer<typeof bmgCrewSchema>;
