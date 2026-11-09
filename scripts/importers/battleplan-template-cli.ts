import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { buildBattleplanTemplatePack } from "./battleplan-template";
import { createImportBundle } from "./bundle";

/** Owner's battleplan notes (git-ignored data/) → reviewable AoS pack bundle in data/import-drafts/. Never touches Neon. */
async function main() {
  const input = valueAfter("--input") ?? "data/battleplans.input.json";
  const output = valueAfter("--out");
  const dataRoot = resolve("data");
  const inside = (path: string) => path === dataRoot || path.startsWith(`${dataRoot}${sep}`);
  if (!inside(resolve(input))) throw new Error("Input must stay inside the git-ignored data/ directory");
  const { pack, warnings } = buildBattleplanTemplatePack(JSON.parse(await readFile(input, "utf8")), { importedAt: new Date().toISOString() });
  const bundle = createImportBundle(pack);
  const target = resolve(output ?? `${dataRoot}/import-drafts/${pack.packId}.battleplans.pack.json`);
  if (!inside(target)) throw new Error("Output must stay inside the git-ignored data/ directory");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(bundle, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output: target, battleplans: pack.catalogue.battleplans.length, battleTactics: pack.catalogue.battleTactics.length, warnings }, null, 2));
}

function valueAfter(key: string) { const index = process.argv.indexOf(key); return index < 0 ? undefined : process.argv[index + 1]; }

if (process.argv[1]?.replace(/\\/g, "/").endsWith("battleplan-template-cli.ts")) main();
