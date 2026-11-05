import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fetchListedSource, readListedSources } from "./source-policy";
import { proposeOfficialProductImages, parseOfficialProductPage } from "./official-products";
import { readLimitedResponse } from "./amg-import";

/** Listed Warhammer product pages only. Image URLs become owner-review suggestions; bytes are never copied. */
async function main() {
  const packPath = valueAfter("--pack");
  if (!packPath) throw new Error("Usage: npx tsx scripts/importers/official-product-cli.ts --pack data/current-aos.pack.json [--out data/import-drafts/product-images.json]");
  const rawPack = JSON.parse(await readFile(packPath, "utf8")) as { gameId?: string; catalogue?: { units?: Array<{ id: string; name: string; factionId?: string }> } };
  if (!rawPack.gameId || !Array.isArray(rawPack.catalogue?.units)) throw new Error("The pack must contain a gameId and catalogue.units list");
  const listed = await readListedSources();
  const sources = listed.filter((source) => source.purpose === "product" && source.gameId === rawPack.gameId);
  if (!sources.length) throw new Error("No product URLs are listed for this game in data/sources.json");
  const candidates = [];
  const fetchedAt: string[] = [];
  for (const source of sources) {
    const { response, fetchedAt: sourceFetchedAt } = await fetchListedSource(source, { listedSources: listed });
    if (!response.ok) throw new Error(`Product page returned HTTP ${response.status}: ${source.url}`);
    fetchedAt.push(sourceFetchedAt);
    const html = new TextDecoder().decode(await readLimitedResponse(response, 15 * 1024 * 1024));
    const products = parseOfficialProductPage(html, source.url);
    candidates.push(...proposeOfficialProductImages(rawPack.catalogue!.units!, products));
  }
  const bundle = {
    schemaVersion: 1,
    gameId: rawPack.gameId,
    sourceKind: "official-product-image-candidates",
    candidates,
    report: {
      listedProductPages: sources.length,
      fetchedAt,
      imageCandidates: candidates.length,
      unmatched: candidates.filter((candidate) => !candidate.matchTargetId).length,
      copiedToBlob: false,
      reviewRequired: true,
    },
  };
  const dataRoot = resolve("data");
  const output = valueAfter("--out");
  const target = resolve(output ?? `${dataRoot}/import-drafts/${rawPack.gameId}-product-images.json`);
  if (target !== dataRoot && !target.startsWith(`${dataRoot}${sep}`)) throw new Error("Output must stay inside the git-ignored data/ directory");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(bundle, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`Created ${candidates.length} private image candidates at ${target}; no image bytes were copied.`);
}

function valueAfter(key: string) { const index = process.argv.indexOf(key); return index < 0 ? undefined : process.argv[index + 1]; }

if (process.argv[1]?.replace(/\\/g, "/").endsWith("official-product-cli.ts")) main();
