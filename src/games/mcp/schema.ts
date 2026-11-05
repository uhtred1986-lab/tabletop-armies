import { z } from "zod";
import { cataloguePackSchema, catalogueSections, recordSchema } from "../catalogue";

export const mcpCharacterSchema = recordSchema.extend({
  characterName: z.string().optional(),
  alterEgoId: z.string().optional(),
  threat: z.number().nonnegative().optional(),
  affiliations: z.array(z.string()).optional(),
  unique: z.boolean().optional(),
  stamina: z.object({ healthy: z.number().positive().optional(), injured: z.number().positive().optional() }).passthrough().optional(),
  keywords: z.array(z.string()).optional(),
  stats: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  abilityIds: z.array(z.string()).optional(),
}).passthrough();

export const mcpCatalogueSchema = z.object({
  ...catalogueSections(),
  units: z.array(mcpCharacterSchema),
  crises: z.array(recordSchema.extend({ type: z.enum(["secure", "extract"]).optional(), threat: z.number().nonnegative().optional() })).default([]),
  affiliations: z.array(recordSchema).default([]),
  teamTactics: z.array(recordSchema).default([]),
  upgrades: z.array(recordSchema).default([]),
  gems: z.array(recordSchema).default([]),
}).passthrough();

export const mcpPackSchema = cataloguePackSchema("mcp", mcpCatalogueSchema);

export const mcpRosterSchema = z.object({
  formatId: z.string().default("standard"),
  characterIds: z.array(z.string()).default([]),
  teamTacticIds: z.array(z.string()).default([]),
  secureCrisisIds: z.array(z.string()).default([]),
  extractCrisisIds: z.array(z.string()).default([]),
  gemIds: z.array(z.string()).default([]),
});

export const mcpSquadSchema = z.object({
  rosterId: z.string().optional(),
  affiliationId: z.string().optional(),
  threatLimit: z.number().positive(),
  characterIds: z.array(z.string()).default([]),
  teamTacticIds: z.array(z.string()).default([]),
  crisisIds: z.array(z.string()).default([]),
  gemByCharacterId: z.record(z.string(), z.string()).default({}),
});

export type McpCatalogue = z.infer<typeof mcpCatalogueSchema>;
export type McpRoster = z.infer<typeof mcpRosterSchema>;
export type McpSquad = z.infer<typeof mcpSquadSchema>;
