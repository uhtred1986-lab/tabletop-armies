import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createImportBundle } from "./bundle";

/** Validate a hand-entered/private rules pack and create a local review bundle, without touching Neon. */
async function main() {
  const input = valueAfter("--input");
  const output = valueAfter("--out");
  if (!input) throw new Error("Usage: npx tsx scripts/importers/manual-pack-cli.ts --input data/private-pack.json [--out data/import-drafts/review.json]");
  const raw = JSON.parse(await readFile(input, "utf8")) as Record<string, unknown>;
  if (!raw || typeof raw !== "object" || !raw.catalogue || typeof raw.catalogue !== "object") throw new Error("Input must be a versioned CataloguePack JSON document");
  const constraints = raw.constraints && typeof raw.constraints === "object" ? raw.constraints as Record<string, unknown> : {};
  const declaredGaps = Array.isArray(constraints.unconfigured) ? constraints.unconfigured : [];
  const pack = {
    ...raw,
    importedAt: new Date().toISOString(),
    provenance: Array.isArray(raw.provenance) && raw.provenance.length ? raw.provenance : [{ kind: "manual", sourceName: "Owner-entered local pack", importedAt: new Date().toISOString() }],
    constraints: {
      ...constraints,
      unconfigured: [
        ...declaredGaps,
        { id: "owner-manual-review", reason: "Confirm each manually entered field against the source before publishing this pack." },
      ],
    },
  };
  const bundle = createImportBundle(pack);
  const dataRoot = resolve("data");
  const target = resolve(output ?? `${dataRoot}/import-drafts/${bundle.pack.packId}.manual.pack.json`);
  if (target !== dataRoot && !target.startsWith(`${dataRoot}${sep}`)) throw new Error("Output must stay inside the git-ignored data/ directory");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(bundle, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`Created ${bundle.candidates.length} owner-review candidates at ${target}`);
}

function valueAfter(key: string) { const index = process.argv.indexOf(key); return index < 0 ? undefined : process.argv[index + 1]; }

if (process.argv[1]?.replace(/\\/g, "/").endsWith("manual-pack-cli.ts")) main();
