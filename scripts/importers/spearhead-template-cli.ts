import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createImportBundle } from "./bundle";
import { buildSpearheadTemplatePack } from "./spearhead-template";

/** Owner's Spearhead notes (git-ignored data/) → reviewable AoS pack bundle in data/import-drafts/. Never touches Neon. */
async function main() {
  const input = valueAfter("--input") ?? "data/spearheads.input.json";
  const output = valueAfter("--out");
  const unitPack = valueAfter("--pack");
  const dataRoot = resolve("data");
  const inside = (path: string) => path === dataRoot || path.startsWith(`${dataRoot}${sep}`);
  if (!inside(resolve(input))) throw new Error("Input must stay inside the git-ignored data/ directory");
  let knownUnitIds: Set<string> | undefined;
  if (unitPack) {
    const raw: unknown = JSON.parse(await readFile(unitPack, "utf8"));
    const pack = raw && typeof raw === "object" && "pack" in raw ? (raw as { pack: unknown }).pack : raw;
    const units = (pack as { catalogue?: { units?: unknown } })?.catalogue?.units;
    knownUnitIds = new Set(Array.isArray(units) ? units.flatMap((unit) => unit && typeof unit === "object" && typeof (unit as { id?: unknown }).id === "string" ? [(unit as { id: string }).id] : []) : []);
  }
  const { pack, warnings } = buildSpearheadTemplatePack(JSON.parse(await readFile(input, "utf8")), { importedAt: new Date().toISOString(), knownUnitIds });
  const bundle = createImportBundle(pack);
  const target = resolve(output ?? `${dataRoot}/import-drafts/${pack.packId}.spearheads.pack.json`);
  if (!inside(target)) throw new Error("Output must stay inside the git-ignored data/ directory");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(bundle, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output: target, spearheads: pack.catalogue.spearheads.length, warnings }, null, 2));
}

function valueAfter(key: string) { const index = process.argv.indexOf(key); return index < 0 ? undefined : process.argv[index + 1]; }

if (process.argv[1]?.replace(/\\/g, "/").endsWith("spearhead-template-cli.ts")) main();
