// Turns the owner's own short Spearhead notes (data/spearheads.input.json, git-ignored) into a reviewable AoS pack.
// Nothing is inferred: a section the owner did not fill stays "unconfigured" (docs/importers.md, "Spearhead").
import { z } from "zod";
import { aosPackSchema, aosSpearheadUnitSchema, spearheadSectionKeys, spearheadSectionStatusSchema } from "@/games/aos/schema";

const recordInput = z.object({ id: z.string().min(1), name: z.string().min(1) }).passthrough();

export const spearheadTemplateInputSchema = z.object({
  packId: z.string().min(1).default("aos-spearheads-owner"),
  revision: z.string().min(1).default("owner-draft"),
  spearheads: z.array(z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    factionId: z.string().min(1).optional(),
    source: z.object({ title: z.string().min(1), printedDate: z.string().optional(), kind: z.enum(["owner-scan", "manual"]) }).strict().optional(),
    units: z.array(aosSpearheadUnitSchema).optional(),
    battleTraits: z.array(recordInput).optional(),
    regimentAbilities: z.array(recordInput).optional(),
    enhancements: z.array(recordInput).optional(),
    /** Only the owner marks a section "configured", after checking it against their own box. */
    sections: z.object(Object.fromEntries(spearheadSectionKeys.map((key) => [key, spearheadSectionStatusSchema.optional()])) as Record<typeof spearheadSectionKeys[number], z.ZodOptional<typeof spearheadSectionStatusSchema>>).strict().optional(),
  }).strict()).min(1),
}).strict();

export type SpearheadTemplateInput = z.input<typeof spearheadTemplateInputSchema>;

const slug = (name: string) => name.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "spearhead";

/**
 * Builds the pack. A filled section starts "incomplete" (entered, not yet checked); an empty one "unconfigured".
 * `knownUnitIds` (from an existing AoS pack) only produces warnings; links are never guessed from names.
 */
export function buildSpearheadTemplatePack(rawInput: unknown, options: { importedAt: string; knownUnitIds?: ReadonlySet<string> }) {
  const input = spearheadTemplateInputSchema.parse(rawInput);
  const warnings: string[] = [];
  const ids = new Set<string>();
  const spearheads = input.spearheads.map((entry) => {
    let id = entry.id ?? slug(entry.name);
    if (ids.has(id)) throw new Error(`Duplicate spearhead id: ${id}`);
    ids.add(id);
    const filled = { units: entry.units ?? [], battleTraits: entry.battleTraits ?? [], regimentAbilities: entry.regimentAbilities ?? [], enhancements: entry.enhancements ?? [] };
    const sections = Object.fromEntries(spearheadSectionKeys.map((key) => [key, entry.sections?.[key] ?? (filled[key].length ? "incomplete" : "unconfigured")]));
    filled.units.forEach((unit, index) => {
      if (!unit.unitId) warnings.push(`${id}: unit ${index + 1} (${unit.name}) has no unitId; link it to a catalogue unit before play.`);
      else if (options.knownUnitIds && !options.knownUnitIds.has(unit.unitId)) warnings.push(`${id}: unitId ${unit.unitId} is not in the given AoS pack.`);
    });
    for (const key of spearheadSectionKeys) if (sections[key] !== "configured") warnings.push(`${id}: section ${key} is ${sections[key]}.`);
    id = id.slice(0, 120);
    return {
      id,
      name: entry.name,
      ...(entry.factionId ? { factionId: entry.factionId } : {}),
      source: entry.source ?? { title: "Owner notes", kind: "manual" as const },
      ...filled,
      sections,
    };
  });
  const pack = aosPackSchema.parse({
    schemaVersion: 1,
    gameId: "aos",
    packId: input.packId,
    revision: input.revision,
    importedAt: options.importedAt,
    provenance: [{ kind: "manual", sourceName: "Owner-entered Spearhead notes", importedAt: options.importedAt }],
    assets: [],
    catalogue: { factions: [], units: [], abilities: [], cards: [], modes: [], scenarios: [], enhancements: [], regiments: [], spearheads },
    constraints: { unconfigured: [{ id: "spearhead-owner-review", reason: "Check every Spearhead section against your own box before marking it configured." }] },
  });
  return { pack, warnings };
}
