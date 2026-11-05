import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createImportBundle } from "./bundle";
import { parseAosBattleProfilesPdf } from "./aos-battle-profiles";
import { stableSourceRevision } from "./matching";

/** Join owner-local BSData unit identities to an explicitly listed official Battle Profiles PDF for review. */
async function main() {
  const packPath = valueAfter("--pack");
  const pdfPath = valueAfter("--pdf");
  const sourceUrl = valueAfter("--source-url");
  const sourceDate = valueAfter("--source-date");
  const output = valueAfter("--out");
  if (!packPath || !pdfPath || !sourceUrl) throw new Error("Usage: npx tsx scripts/importers/aos-battle-profiles-cli.ts --pack data/aos.pack.json --pdf data/battle-profiles.pdf --source-url https://... [--source-date YYYY-MM] [--out data/import-drafts/aos-battle-profiles.pack.json]");
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Battle Profiles source URL must be a clean HTTPS URL");
  if (url.hostname !== "warhammer-community.com" && !url.hostname.endsWith(".warhammer-community.com")) throw new Error("Battle Profiles provenance must identify an official Warhammer Community URL");
  if (sourceDate && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(sourceDate)) throw new Error("source-date must be a verified year, month or date");
  const rawPack = JSON.parse(await readFile(packPath, "utf8")) as Record<string, unknown>;
  const catalogue = object(rawPack.catalogue);
  if (rawPack.gameId !== "aos" || !Array.isArray(catalogue.units)) throw new Error("Pack must be an AoS CataloguePack with catalogue.units");
  const units = catalogue.units.map(object).flatMap((unit) => typeof unit.id === "string" && typeof unit.name === "string" ? [{ id: unit.id, name: unit.name }] : []);
  const parsed = await parseAosBattleProfilesPdf({ path: pdfPath, sourceUrl: url.toString(), units });
  const digest = stableSourceRevision(await readFile(pdfPath));
  const now = new Date().toISOString();
  const provenance = Array.isArray(rawPack.provenance) ? rawPack.provenance : [];
  const pack = {
    ...rawPack,
    packId: `${String(rawPack.packId ?? "aos")}-profiles-${digest.slice(0, 12)}`,
    revision: stableSourceRevision(`${String(rawPack.revision ?? "")}:${digest}`),
    importedAt: now,
    provenance: [...provenance, { kind: "owner-import", sourceName: "Official AoS Battle Profiles", sourceUrl: url.toString(), ...(sourceDate ? { sourceDate } : {}), importedAt: now, note: "Extracted points rows are review candidates; verify table columns. Unit-size semantics are retained without automatic minimum-size mapping." }],
    constraints: { ...object(rawPack.constraints), battleProfilesImport: parsed.report },
  };
  const bundle = createImportBundle(pack);
  const payload = {
    ...bundle,
    sourceKind: "aos-battle-profiles-candidates",
    candidates: [...bundle.candidates, ...parsed.candidates.map((candidate) => ({ ...candidate, proposed: { ...candidate.proposed, ...(sourceDate ? { sourceDate } : {}) } }))],
    report: { ...bundle.report, battleProfiles: parsed.report, sourceDate: sourceDate ?? "unknown" },
  };
  const dataRoot = resolve("data");
  const target = resolve(output ?? `${dataRoot}/import-drafts/${pack.packId}.pack.json`);
  if (target !== dataRoot && !target.startsWith(`${dataRoot}${sep}`)) throw new Error("Output must stay inside the git-ignored data/ directory");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(payload, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`Created ${bundle.candidates.length} catalogue and ${parsed.candidates.length} Battle Profiles review candidates at ${target}.`);
  console.log(`Matched ${parsed.report.exactUnitMatches}; ${parsed.report.unmatchedRows} unrecognized rows need manual review.`);
}

function valueAfter(key: string) { const index = process.argv.indexOf(key); return index < 0 ? undefined : process.argv[index + 1]; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

if (process.argv[1]?.replace(/\\/g, "/").endsWith("aos-battle-profiles-cli.ts")) main();
