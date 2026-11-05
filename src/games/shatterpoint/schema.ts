import { z } from "zod";
import { cataloguePackSchema, catalogueSections, recordSchema } from "../catalogue";

export const shatterpointUnitSchema = recordSchema.extend({
  role: z.enum(["primary", "secondary", "supporting"]).optional(),
  eras: z.array(z.string()).optional(),
  uniqueNames: z.array(z.string()).optional(),
  squadPoints: z.number().nonnegative().optional(),
  keywords: z.array(z.string()).optional(),
  stats: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  abilityIds: z.array(z.string()).optional(),
}).passthrough();

export const shatterpointCatalogueSchema = z.object({
  ...catalogueSections(),
  units: z.array(shatterpointUnitSchema),
  stances: z.array(recordSchema).default([]),
  orderCards: z.array(recordSchema).default([]),
}).passthrough();

export const shatterpointPackSchema = cataloguePackSchema("shatterpoint", shatterpointCatalogueSchema);

export const shatterpointTeamSchema = z.object({
  modeId: z.string().optional(),
  squads: z.array(z.object({ unitIds: z.array(z.string()) }).strict()),
}).strict();

export type ShatterpointCatalogue = z.infer<typeof shatterpointCatalogueSchema>;
export type ShatterpointTeam = z.infer<typeof shatterpointTeamSchema>;
