import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { composeCataloguePacks } from "@/games/compose";

async function main() {
  const output = valueAfter("--out");
  const paths = process.argv.slice(2).filter((value, index, all) => value !== "--out" && all[index - 1] !== "--out" && !value.startsWith("--"));
  if (paths.length < 2) throw new Error("Usage: npx tsx scripts/importers/compose-packs-cli.ts <pack.json> <pack.json> [...packs] [--out data/import-drafts/composed.pack.json]");
  const packs = await Promise.all(paths.map(async (path) => {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    return raw && typeof raw === "object" && "pack" in raw ? (raw as { pack: unknown }).pack : raw;
  }));
  const result = composeCataloguePacks(packs);
  const target = resolve(output ?? `data/import-drafts/${result.pack.packId}.pack.json`);
  const dataRoot = resolve("data");
  if (target !== dataRoot && !target.startsWith(`${dataRoot}${sep}`)) throw new Error("Output must stay inside the git-ignored data/ directory");
  await mkdir(dirname(target), { recursive: true });
  const json = JSON.stringify(result.pack, null, 2);
  await writeFile(target, json, { flag: "wx", mode: 0o600 });
  const bytes = Buffer.byteLength(json);
  console.log(JSON.stringify({ output: target, sourcePacks: result.sourcePackIds, bytes, warnings: result.warnings, staging: bytes > 3 * 1024 * 1024 ? "Over 3 MiB: stage original packs separately; collection unions newest stable IDs across packs." : "Within 3 MiB per-file staging limit." }, null, 2));
}

function valueAfter(key: string) { const index = process.argv.indexOf(key); return index < 0 ? undefined : process.argv[index + 1]; }
if (process.argv[1]?.replace(/\\/g, "/").endsWith("compose-packs-cli.ts")) main();
