import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createImportBundle } from "./bundle";
import { parseAosBsdata } from "./aos-bsdata";

/**
 * Usage: npx tsx scripts/importers/aos-bsdata-cli.ts --gst data/source/game.gst --cat data/source/faction.cat [...]
 * Optional: --out data/import-drafts/aos-pack.json. Input and output stay local; no database is written.
 */
async function main() {
  const args = process.argv.slice(2);
  const gst = valueAfter(args, "--gst");
  const cats = allValuesAfter(args, "--cat");
  const output = valueAfter(args, "--out") ?? undefined;
  if (!gst || !cats.length) throw new Error("Provide one --gst file and at least one --cat file");
  const parsed = parseAosBsdata({ gameSystemXml: await readFile(gst, "utf8"), catalogueFiles: await Promise.all(cats.map(async (path) => ({ fileName: basename(path), xml: await readFile(path, "utf8") }))) });
  const bundle = createImportBundle(parsed.pack);
  const payload = { ...bundle, parserDiagnostics: parsed.diagnostics };
  const dataRoot = resolve("data");
  const target = resolve(output ?? `${dataRoot}/import-drafts/${parsed.pack.packId}.pack.json`);
  if (target !== dataRoot && !target.startsWith(`${dataRoot}${sep}`)) throw new Error("Output must stay inside the git-ignored data/ directory");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(payload, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`Created ${bundle.candidates.length} private review candidates at ${target}`);
  if (parsed.diagnostics.length) console.log(`${parsed.diagnostics.length} parser diagnostics need review; no incomplete profile was accepted silently.`);
}

function valueAfter(args: string[], key: string) { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; }
function allValuesAfter(args: string[], key: string) { return args.flatMap((arg, index) => arg === key && args[index + 1] ? [args[index + 1]!] : []); }
function basename(value: string) { return value.split(/[\\/]/).at(-1)!; }

if (process.argv[1]?.replace(/\\/g, "/").endsWith("aos-bsdata-cli.ts")) main();
