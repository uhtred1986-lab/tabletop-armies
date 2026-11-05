import { load } from "cheerio";
import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { fetchListedSource, readListedSources, type ListedSource } from "./source-policy";
import { normalizeName, stableId, stableSourceRevision } from "./matching";
import { createImportBundle } from "./bundle";
import { readPdfPageLines, renderPdfPagePngs } from "./pdf-text";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { buildRulePdfDraft } from "./rule-pdf-draft";
import { extractMcpStatProfile, type McpStatProfile } from "./mcp-profile";

type GameId = "mcp" | "legion" | "shatterpoint" | "bmg";
type TextRecord = { entityKind: "unit" | "card" | "mode" | "scenario"; sourceId: string; proposed: Record<string, unknown> };
type McpUnitDraft = { id: string; name: string; sourceId: string; provenance: number[]; cardIds: string[]; aliases: string[]; sourceVariants: Array<Record<string, unknown>>; stats: Record<string, unknown>; statProfiles: Array<Record<string, unknown>>; profileCompleteness?: string; threat?: number; stamina?: Record<string, number>; reviewFlags: string[]; [key: string]: unknown };

/** Fetch listed AMG pages and PDFs only after robots/terms gates pass. Raw bytes stay under ignored data/. */
export async function fetchAmgSources(options: { sourcesPath?: string; outputDir?: string }) {
  const all = await readListedSources(options.sourcesPath);
  const sources = all.filter((source) => ["card", "token", "modes", "scenario"].includes(source.purpose) && /\.(?:pdf|jpe?g|png|webp)$/i.test(new URL(source.url).pathname));
  const outputDir = resolve(options.outputDir ?? "data/amg/raw");
  const fetched: Array<{ source: ListedSource; path: string; fetchedAt: string; contentType: string }> = [];
  for (const source of sources) {
    const { response, fetchedAt } = await fetchListedSource(source, { listedSources: all });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}: ${source.url}`);
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const bytes = await readLimitedResponse(response, 120 * 1024 * 1024);
    const assetSuffix = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" } as Record<string, string>)[contentType.split(";")[0]!.trim().toLowerCase()];
    const suffix = assetSuffix ?? (/\.(?:pdf|jpe?g|png|webp)$/i.exec(new URL(source.url).pathname)?.[0] ?? ".bin");
    const path = resolve(outputDir, `${hash(source.url)}${suffix}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx" }).catch(async (error: unknown) => {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      await writeFile(path, bytes);
    });
    fetched.push({ source, path, fetchedAt, contentType });
  }
  const manifestPath = resolve(outputDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(fetched, null, 2), { mode: 0o600 });
  return { manifestPath, fetched };
}

/** Build a manifest for files manually downloaded by the owner into the ignored data/amg/manual/ folder. */
export async function createLocalAmgManifest(sourcesPath?: string, outputPath = "data/amg/raw/manifest.json") {
  const sources = await readListedSources(sourcesPath);
  const selected = sources.filter((source) => source.localPath && ["catalogue", "modes", "scenario", "card", "token"].includes(source.purpose));
  if (!selected.length) throw new Error("No AMG sources have a localPath inside data/amg/manual/");
  const manifest = await Promise.all(selected.map(async (source) => {
    const path = resolve(source.localPath!);
    const fileStat = await stat(path);
    if (!fileStat.isFile()) throw new Error(`Manual source is not a file: ${source.localPath}`);
    return {
      source,
      path,
      fetchedAt: fileStat.mtime.toISOString(),
      contentType: contentTypeForPath(path),
    };
  }));
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return { manifestPath: target, count: manifest.length };
}

/** Parse the saved fetch manifest into validated per-game review bundles. Image bytes are uploaded only through the
 * shared private Blob helper. The resulting bundle belongs in ignored data/ and only enters Neon after review. */
export async function parseAmgManifest(manifestPath = resolve("data/amg/raw/manifest.json"), options: { uploadAssets?: boolean; outputDir?: string; identityMapPath?: string } = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Array<{
    source: ListedSource;
    path: string;
    fetchedAt: string;
    contentType: string;
  }>;
  const identityMapFile = options.identityMapPath ? JSON.parse(await readFile(resolve(options.identityMapPath), "utf8")) as ProductIdentityMapFile : undefined;
  const identityMap: ProductIdentityMap | undefined = identityMapFile
    ? ((identityMapFile as { formatVersion?: number }).formatVersion === 1
      ? (identityMapFile as { identities: ProductIdentityMap }).identities
      : identityMapFile as ProductIdentityMap)
    : undefined;
  const drafts = new Map<GameId, { provenance: Array<Record<string, unknown>>; catalogue: Record<string, unknown>; reports: Array<Record<string, unknown>>; assetCandidates: Array<Record<string, unknown>>; sourceDigests: string[] }>();
  const getDraft = (gameId: GameId) => {
    if (!drafts.has(gameId)) drafts.set(gameId, {
      provenance: [],
      catalogue: { factions: [], units: [], abilities: [], cards: [], modes: [], scenarios: [], enhancements: [], regiments: [], crises: [], affiliations: [], teamTactics: [], upgrades: [], stances: [], orderCards: [], commandCards: [], battleForces: [], equipment: [], objectiveCards: [] },
      reports: [],
      assetCandidates: [],
      sourceDigests: [],
    });
    return drafts.get(gameId)!;
  };
  for (const item of manifest) {
    const gameId = item.source.gameId;
    if (!gameId || !["mcp", "legion", "shatterpoint", "bmg"].includes(gameId)) {
      throw new Error(`AMG source ${item.source.url} needs an explicit gameId in data/sources.json`);
    }
    const draft = getDraft(gameId as GameId);
    const sourceDigest = stableSourceRevision(await readFile(item.path));
    draft.sourceDigests.push(`${item.source.url}:${sourceDigest}`);
    const provenanceIndex = draft.provenance.length;
    const provenance = {
      kind: "owner-import",
      sourceName: "Official game publisher source",
      sourceUrl: item.source.url,
      ...(item.source.sourceDate ? { sourceDate: item.source.sourceDate } : {}),
      importedAt: new Date().toISOString(),
      note: item.source.termsReview ? `Terms review recorded ${item.source.termsReview.reviewedAt}` : "Terms review missing; this local file was provided by the owner",
    };
    draft.provenance.push(provenance);
    const isPdf = item.contentType.includes("pdf") || item.path.toLowerCase().endsWith(".pdf");
    const isHtml = item.contentType.includes("html") || item.path.toLowerCase().endsWith(".html");
    const isImage = item.contentType.startsWith("image/");
    if (isHtml && (item.source.purpose === "modes" || item.source.purpose === "scenario")) {
      const html = await readFile(item.path, "utf8");
      const parsed = parseAmgHtmlPage({ gameId: gameId as GameId, url: item.source.url, purpose: item.source.purpose, html, importedAt: new Date().toISOString(), provenanceIndex, sourceDate: item.source.sourceDate });
      const targetSection = item.source.purpose === "modes" ? "modes" : "scenarios";
      (draft.catalogue[targetSection] as unknown[]).push(...parsed.records);
      draft.reports.push({ sourceUrl: item.source.url, fetchedAt: item.fetchedAt, kind: targetSection, recordCount: parsed.records.length, discoveredLinks: parsed.records.filter((record) => "sourceListingUrl" in record).length });
      continue;
    }
    if (isHtml && item.source.purpose === "catalogue") {
      const html = await readFile(item.path, "utf8");
      const parsed = parseAmgCharacterProductPage({ gameId: gameId as GameId, url: item.source.url, html, provenanceIndex, identityMap });
      (draft.catalogue.units as unknown[]).push(...parsed.units);
      (draft.catalogue.cards as unknown[]).push(...parsed.cards);
      draft.reports.push({ sourceUrl: item.source.url, fetchedAt: item.fetchedAt, kind: "character-product-page", units: parsed.units.length, cards: parsed.cards.length, warnings: parsed.warnings });
      continue;
    }
    if (isPdf && (item.source.purpose === "modes" || item.source.purpose === "scenario")) {
      const parsed = await readPdfPageLines(item.path);
      const seedCandidates = item.source.recordCandidates ?? [{ kind: item.source.purpose === "scenario" ? "scenario" as const : "mode" as const, name: item.source.documentTitle ?? sourceTitle(item.source.url) }];
      const doc = buildRulePdfDraft({
        gameId: gameId as GameId,
        sourceUrl: item.source.url,
        ...(item.source.sourceDate ? { sourceDate: item.source.sourceDate } : {}),
        sourceSha256: stableSourceRevision(await readFile(item.path)),
        documentTitle: item.source.documentTitle ?? sourceTitle(item.source.url),
        documentType: item.source.purpose,
        pages: parsed.pages.map(({ page, text }) => ({ page, text })),
        candidates: seedCandidates,
      });
      const targetSection = item.source.purpose === "modes" ? "modes" : "scenarios";
      (draft.catalogue[targetSection] as unknown[]).push(...doc.candidates.map((candidate) => ({ ...candidate.proposed, provenance: [provenanceIndex] })));
      draft.reports.push({ sourceUrl: item.source.url, fetchedAt: item.fetchedAt, kind: "rule-pdf", document: { ...doc.document, sections: undefined }, recordCount: doc.candidates.length, extractedCharacters: doc.document.extractedCharacters, emptyPages: doc.document.emptyPages });
      continue;
    }
    if (isPdf && item.source.purpose === "card") {
      const parsed = await parseCardPdf({ gameId: gameId as GameId, sourceUrl: item.source.url, path: item.path, importedAt: new Date().toISOString(), provenanceIndex, uploadAssets: options.uploadAssets });
      (draft.catalogue.cards as unknown[]).push(...parsed.records);
      mergeCatalogueUnits(draft.catalogue.units as Array<Record<string, unknown>>, parsed.units);
      ((draft.catalogue as Record<string, unknown>).__privateAssets ??= []);
      ((draft.catalogue as Record<string, unknown>).__privateAssets as unknown[]).push(...parsed.assets);
      draft.reports.push({ sourceUrl: item.source.url, fetchedAt: item.fetchedAt, kind: "card-pdf", ...parsed.report });
      continue;
    }
    if (isImage && (item.source.purpose === "card" || item.source.purpose === "token")) {
      const bytes = new Uint8Array(await readFile(item.path));
      const mimeType = item.contentType.split(";")[0]!.trim().toLowerCase();
      const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[mimeType];
      if (!extension) throw new Error(`Unsupported private image type ${mimeType} at ${item.source.url}`);
      if (!options.uploadAssets) {
        draft.assetCandidates.push({ sourceUrl: item.source.url, localPath: item.path, kind: item.source.purpose, bytes: bytes.byteLength, requiresPrivateUpload: true });
        continue;
      }
      const assetId = stableId(item.source.purpose, item.source.url);
      const blobKey = `imports/${gameId}/${item.source.purpose}/${assetId}.${extension}`;
      const stored = await (await import("@/lib/blob")).putPrivateBlob(blobKey, bytes, mimeType);
      const asset = { id: assetId, kind: item.source.purpose, ref: stored.pathname, mimeType, sourceUrl: item.source.url, ...(item.source.sourceDate ? { sourceDate: item.source.sourceDate } : {}) };
      draft.reports.push({ sourceUrl: item.source.url, fetchedAt: item.fetchedAt, kind: "private-image", assetId, blobKey: stored.pathname, bytes: bytes.byteLength });
      // Assets are merged into the envelope below, separate from catalogue records.
      (draft.catalogue as Record<string, unknown>).__privateAssets ??= [];
      ((draft.catalogue as Record<string, unknown>).__privateAssets as unknown[]).push(asset);
      continue;
    }
    draft.reports.push({ sourceUrl: item.source.url, fetchedAt: item.fetchedAt, kind: "unparsed", contentType: item.contentType, warning: "No parser is configured for this file type and purpose." });
  }

  for (const [gameId, draft] of drafts) {
    if (gameId === "mcp") applyMcpAlterEgoIds(draft.catalogue.units as Array<Record<string, unknown>>);
  }

  const outputDir = resolve(options.outputDir ?? "data/amg/drafts");
  const result: Array<{ gameId: GameId; path: string; candidates: number; coverage: Array<Record<string, unknown>> }> = [];
  await mkdir(outputDir, { recursive: true });
  for (const [gameId, draft] of drafts) {
    const assets = (draft.catalogue.__privateAssets as unknown[] | undefined) ?? [];
    delete draft.catalogue.__privateAssets;
    const revision = stableSourceRevision(draft.sourceDigests.sort().join("\n"));
    const pack = {
      schemaVersion: 1,
      gameId,
      packId: `${gameId}-${revision.slice(0, 12)}`,
      revision,
      importedAt: new Date().toISOString(),
      provenance: draft.provenance,
      assets,
      catalogue: draft.catalogue,
      constraints: {
        unconfigured: [
          { id: "game-rules", reason: "Review source rows and enter any paid rules or game configuration manually." },
          { id: "formats", reason: "Modes and scenarios are source candidates; their complete rules/configuration are not assumed." },
        ],
        sourceCoverage: { listedSources: manifest.filter((item) => item.source.gameId === gameId).length, parsedReports: draft.reports.length },
        parserReports: draft.reports,
      },
    };
    const bundle = createImportBundle(pack);
    const payload = { ...bundle, assetCandidates: draft.assetCandidates };
    const path = resolve(outputDir, `${pack.packId}${options.uploadAssets ? "-with-assets" : ""}.pack.json`);
    const pretty = JSON.stringify(payload, null, 2);
    const serialized = Buffer.byteLength(pretty) > 2_500_000 ? JSON.stringify(payload) : pretty;
    await writeFile(path, serialized, { mode: 0o600 });
    result.push({ gameId, path, candidates: bundle.candidates.length, coverage: draft.reports });
  }
  return result;
}

/** Discover only mode/scenario links on an already listed official page; caller must list each result before fetching. */
export function discoverModeScenarioLinks(html: string, pageUrl: string, allowedHosts: string[]) {
  const $ = load(html);
  const base = new URL(pageUrl);
  const found = new Map<string, { url: string; purpose: "modes" | "scenario"; label: string }>();
  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let url: URL;
    try { url = new URL(href, base); } catch { return; }
    if (url.protocol !== "https:" || !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return;
    const context = `${url.pathname} ${$(element).text()} ${$(element).attr("title") ?? ""}`.toLowerCase();
    const purpose = /scenario|mission|battleplan|battle-plan/.test(context) ? "scenario" : /mode|format|gamemode|game-mode|organized-play/.test(context) ? "modes" : undefined;
    if (!purpose) return;
    url.hash = "";
    found.set(url.toString(), { url: url.toString(), purpose, label: $(element).text().trim().replace(/\s+/g, " ") });
  });
  return [...found.values()];
}

/** Return explicit source candidates from owner-saved pages. These links are suggestions; none are fetched here. */
export function discoverAmgCatalogLinks(html: string, pageUrl: string, allowedHosts: string[]) {
  const $ = load(html);
  const base = new URL(pageUrl);
  const result = new Map<string, { url: string; purpose: ListedSource["purpose"]; label: string; contentKind: "html" | "pdf" | "image" | "unknown" }>();
  const candidates: Array<{ href?: string; label: string; image: boolean }> = [];
  $("a[href]").each((_index, element) => { candidates.push({ href: $(element).attr("href"), label: $(element).text().trim(), image: false }); });
  $(".reveal-cards img[src], .reveal-cards img[data-src], .reveal-cards img[srcset]").each((_index, element) => {
    const img = $(element);
    candidates.push({ href: img.attr("src") ?? img.attr("data-src") ?? img.attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0], label: img.attr("alt") ?? img.attr("title") ?? "Card image", image: true });
  });
  for (const item of candidates) {
    if (!item.href) continue;
    let url: URL;
    try { url = new URL(item.href, base); } catch { continue; }
    if (url.protocol !== "https:" || !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) continue;
    url.hash = "";
    const isPdf = url.pathname.toLowerCase().endsWith(".pdf");
    const isImage = /\.(?:jpe?g|png|webp)$/i.test(url.pathname);
    const lower = `${item.label} ${url.pathname}`.toLowerCase();
    const purpose: ListedSource["purpose"] = item.image || isImage || /stat card|unit card|character card|stance card|token|card/.test(lower)
      ? "card"
      : /scenario|mission|battle.?plan|crisis/.test(lower)
        ? "scenario"
        : /mode|format|organized play|event rules|campaign/.test(lower)
          ? "modes"
          : "catalogue";
    result.set(url.toString(), { url: url.toString(), purpose, label: item.label, contentKind: isPdf ? "pdf" : isImage ? "image" : url.pathname.endsWith(".html") ? "html" : "unknown" });
  }
  return [...result.values()];
}

/** Parse linked pages into owner-review candidates. We deliberately do not infer that every link is a playable rule. */
export function parseAmgHtmlPage(input: { gameId: GameId; url: string; purpose: "modes" | "scenario"; html: string; importedAt?: string; sourceDate?: string; provenanceIndex?: number }) {
  const $ = load(input.html);
  const title = $("h1").first().text().trim() || $("title").first().text().trim();
  const bodyText = $("main").text().trim() || $("article").text().trim() || $("body").text().trim();
  const name = title || new URL(input.url).pathname.split("/").filter(Boolean).at(-1)?.replace(/[-_]/g, " ") || input.purpose;
  const discovered = discoverModeScenarioLinks(input.html, input.url, [new URL(input.url).hostname]);
  const records = discovered.length
    ? discovered.map((link) => ({
        id: stableId(link.purpose === "modes" ? "mode" : "scenario", link.url),
        name: link.label || link.url.split("/").filter(Boolean).at(-1)?.replace(/[-_]/g, " ") || "Unidentified item",
        sourceUrl: link.url,
        sourceListingUrl: input.url,
        provenance: [input.provenanceIndex ?? 0],
        ...(input.sourceDate ? { sourceDate: input.sourceDate } : {}),
        reviewFlags: ["source-link-found-on-listed-page", "content-not-fetched", "owner-confirm-mode-or-scenario"],
      }))
    : [{
        id: stableId(input.purpose, input.url),
        name,
        sourceUrl: input.url,
        provenance: [input.provenanceIndex ?? 0],
        ...(input.sourceDate ? { sourceDate: input.sourceDate } : {}),
        sourceText: bodyText,
        reviewFlags: bodyText ? ["owner-confirm-mode-or-scenario", "may-be-listing-page"] : ["no-readable-text"],
      }];
  const provenance = { kind: "owner-import", sourceName: "Atomic Mass Games official site", sourceUrl: input.url, importedAt: input.importedAt ?? new Date().toISOString() };
  return {
    gameId: input.gameId,
    provenance: [provenance],
    records,
    candidates: records.map((record) => ({ entityKind: input.purpose === "modes" ? "mode" : "scenario", sourceId: String(record.sourceUrl), proposed: record } satisfies TextRecord)),
  };
}

/** Shatterpoint/MCP product pages expose paired card images in a reveal-cards section. This parser records names
 * from asset filenames only as review suggestions; it does not infer role, stats, affiliations, or legality. */
type ProductIdentityMap = Record<string, { name: string; aliases?: string[] }>;
type ProductIdentityMapFile = ProductIdentityMap | { formatVersion: 1; sourceUrl: string; accessedOn: string; verification: string; identities: ProductIdentityMap };

export function parseAmgCharacterProductPage(input: { gameId: GameId; url: string; html: string; provenanceIndex?: number; identityMap?: ProductIdentityMap }) {
  const $ = load(input.html);
  const cardsByName = new Map<string, Array<{ card: Record<string, unknown>; side: "V" | "H" | "unknown" }>>();
  const stanceCards: Record<string, unknown>[] = [];
  const seenImageUrls = new Set<string>();
  $(".reveal-cards img[src], .reveal-cards img[data-src], .reveal-cards img[srcset]").each((_index, element) => {
    const img = $(element);
    const raw = img.attr("src") ?? img.attr("data-src") ?? img.attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0];
    if (!raw) return;
    let url: URL;
    try { url = new URL(raw, input.url); } catch { return; }
    if (url.protocol !== "https:" || ![new URL(input.url).hostname, "cdn.svc.asmodee.net"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return;
    if (!/\.(?:jpe?g|png|webp)$/i.test(url.pathname) || seenImageUrls.has(url.toString())) return;
    seenImageUrls.add(url.toString());
    url.hash = "";
    const stem = url.pathname.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? "";
    const side = /_V$/i.test(stem) ? "V" : /_H$/i.test(stem) ? "H" : "unknown";
    const withoutSet = stem.replace(/^[A-Z]{2,}\d+[_-]/i, "");
    const stanceMatch = withoutSet.match(/^(.*)_Stance(?:\d+|_Article)?$/i);
    const filenameUnitKey = (stanceMatch?.[1] ?? withoutSet).replace(/_[VH]$/i, "");
    const nameFromFile = filenameUnitKey.replace(/[_-]+/g, " ").trim();
    const identity = input.identityMap?.[normalizeName(filenameUnitKey)] ?? input.identityMap?.[normalizeName(nameFromFile)];
    const name = identity?.name ?? nameFromFile;
    if (!name) return;
    const stableUnitSourceId = `${input.gameId}:${normalizeName(name)}`;
    const assetId = stableId("card", url.toString());
    const id = stableId("card", url.toString());
    const card = {
      id,
      name: stanceMatch ? `${name} Stance` : name,
      sourceId: url.toString(),
      sourceUrl: url.toString(),
      filenameAlias: nameFromFile,
      productUrl: input.url,
      cardType: stanceMatch ? "stance" : "unit-card",
      filenameUnitKey,
      ...(stanceMatch ? { stanceLabel: withoutSet.slice(filenameUnitKey.length + 1).replace(/_/g, " "), associatedUnitId: stableId("unit", stableUnitSourceId) } : {}),
      ...(side !== "unknown" ? { side: side === "V" ? "front" : "back" } : {}),
      provenance: [input.provenanceIndex ?? 0],
      assetIds: [assetId],
      reviewFlags: [
        ...(identity ? ["name-from-owner-verified-identity-map"] : ["name-from-image-filename-needs-confirmation"]),
        ...(stanceMatch ? ["stance-card-not-a-unit"] : []),
        "rules-fields-not-read-from-image",
      ],
    };
    if (stanceMatch) {
      stanceCards.push(card);
      return;
    }
    const key = normalizeName(name);
    cardsByName.set(key, [...(cardsByName.get(key) ?? []), { card, side }]);
  });
  const cards = [...cardsByName.values()].flatMap((items) => items.map(({ card }) => card));
  const units = [...cardsByName.entries()].map(([normalized, items]) => {
    const name = String(items[0]!.card.name);
    const filenameKey = String(items[0]!.card.filenameUnitKey ?? "");
    const identity = input.identityMap?.[normalizeName(filenameKey)];
    const sides = new Set(items.map(({ side }) => side));
    return {
      id: stableId("unit", `${input.gameId}:${normalized}`),
      name,
      sourceId: `${input.gameId}:${normalized}`,
      aliases: [...new Set([
        ...(identity?.aliases ?? []),
        ...items.map(({ card }) => String(card.filenameAlias ?? "")),
      ].filter((alias) => alias && normalizeName(alias) !== normalizeName(name)))],
      provenance: [input.provenanceIndex ?? 0],
      cardIds: items.map(({ card }) => card.id),
      sourceVariants: [{ productUrl: input.url, cardIds: items.map(({ card }) => card.id) }],
      profileCompleteness: "identity-and-card-images-only",
      reviewFlags: [
        ...(identity ? [] : ["owner-confirm-unit-name"]),
        ...(sides.has("V") && sides.has("H") ? [] : ["front-back-pair-unconfirmed"]),
        "role-and-rules-fields-unconfigured",
      ],
    };
  });
  return {
    units,
    cards: [...cards, ...stanceCards],
    warnings: cards.length || stanceCards.length ? [] : ["No reveal-cards images found; this page does not provide a parser-supported unit listing."],
  };
}

export function mergeCatalogueUnits(target: Array<Record<string, unknown>>, incoming: readonly Record<string, unknown>[]) {
  const bySourceId = new Map(target.map((unit, index) => [String(unit.sourceId), index]));
  for (const unit of incoming) {
    const sourceId = String(unit.sourceId ?? unit.id);
    const existingIndex = bySourceId.get(sourceId);
    if (existingIndex === undefined) {
      target.push({ ...unit });
      bySourceId.set(sourceId, target.length - 1);
      continue;
    }
    const existing = target[existingIndex]!;
    for (const key of ["cardIds", "aliases", "provenance", "reviewFlags"] as const) {
      const values = [...(Array.isArray(existing[key]) ? existing[key] as unknown[] : []), ...(Array.isArray(unit[key]) ? unit[key] as unknown[] : [])];
      existing[key] = [...new Set(values)];
    }
    if (Array.isArray(existing.statProfiles) || Array.isArray(unit.statProfiles)) {
      const profiles = [
        ...(Array.isArray(existing.statProfiles) ? existing.statProfiles as Array<Record<string, unknown>> : []),
        ...(Array.isArray(unit.statProfiles) ? unit.statProfiles as Array<Record<string, unknown>> : []),
      ];
      existing.statProfiles = profiles;
      applyMcpProfileSummary(existing as McpUnitDraft, profiles);
    }
    if (Array.isArray(unit.unlabelledNumericMarkers)) {
      existing.unlabelledNumericMarkers = [...(Array.isArray(existing.unlabelledNumericMarkers) ? existing.unlabelledNumericMarkers : []), ...unit.unlabelledNumericMarkers];
    }
    const variants = [
      ...(Array.isArray(existing.sourceVariants) ? existing.sourceVariants as Array<Record<string, unknown>> : []),
      ...(Array.isArray(unit.sourceVariants) ? unit.sourceVariants as Array<Record<string, unknown>> : []),
    ];
    const variantsBySource = new Map<string, Record<string, unknown>>();
    for (const variant of variants) {
      const variantKey = String(variant.sourceUrl ?? variant.productUrl ?? "unknown-source");
      const previous = variantsBySource.get(variantKey);
      variantsBySource.set(variantKey, previous ? { ...previous, ...variant, cardIds: [...new Set([...(Array.isArray(previous.cardIds) ? previous.cardIds : []), ...(Array.isArray(variant.cardIds) ? variant.cardIds : [])])] } : variant);
    }
    if (variantsBySource.size) existing.sourceVariants = [...variantsBySource.values()];
  }
}

type McpIdentityFace = { name: string; alias?: string };

/** A printed character title alone is insufficient when different alter egos share it. */
export function groupMcpFacesByIdentity<T extends McpIdentityFace>(faces: readonly T[]) {
  const groups = new Map<string, { key: string; sourceId: string; name: string; alias?: string; faces: T[] }>();
  for (const face of faces) {
    const normalizedName = normalizeName(face.name);
    const normalizedAlias = normalizeName(face.alias ?? "");
    const key = `${normalizedName}\0${normalizedAlias}`;
    const existing = groups.get(key);
    if (existing) existing.faces.push(face);
    else groups.set(key, {
      key,
      sourceId: `mcp:${normalizedName}::${normalizedAlias || "no-alter-ego"}`,
      name: face.name,
      ...(face.alias ? { alias: face.alias } : {}),
      faces: [face],
    });
  }
  return [...groups.values()];
}

/** Alter-ego identity is the normalized printed alias, shared across different character titles. */
export function applyMcpAlterEgoIds(units: Array<Record<string, unknown>>) {
  for (const unit of units) {
    const alias = normalizeName(String(unit.alterEgoName ?? ""));
    const flags = Array.isArray(unit.reviewFlags) ? unit.reviewFlags.map(String) : [];
    if (!alias || flags.includes("alter-ego-extraction-uncertain")) {
      delete unit.alterEgoId;
      unit.reviewFlags = [...new Set([...flags.filter((flag) => flag !== "alter-ego-id-ambiguous"), "alter-ego-unverified"] )];
      continue;
    }
    unit.alterEgoId = alias;
    unit.reviewFlags = [...new Set(flags.filter((flag) => flag !== "alter-ego-id-ambiguous" && flag !== "alter-ego-unverified"))];
  }
}

/** Extract literal PDF text and numeric snippets; never claims a card is complete without owner review. */
export async function parseCardPdf(input: { gameId: GameId; sourceUrl: string; path: string; purpose?: "card" | "token"; importedAt?: string; provenanceIndex?: number; uploadAssets?: boolean }) {
  if (input.gameId === "mcp" && (input.purpose ?? "card") === "card") {
    const format = mcpCardPdfFormat(input.sourceUrl);
    if (format === "grunts") return parseMcpGruntStatCardPdf(input);
    if (format === "horsemen") return parseMcpHorsemenCardsPdf(input);
    return parseMcpStatCardPdf(input);
  }
  const parsedPdf = await readPdfPageLines(input.path);
  const pages = parsedPdf.pages;
  const fullText = pages.map(({ text }) => text).filter(Boolean).join("\n");
  const records = pages.map(({ page, text }) => {
    const sourceId = `${input.sourceUrl}#page=${page}`;
    const numbers = extractNumericFields(text);
    return {
      id: stableId(input.purpose ?? "card", sourceId),
      name: inferTitle(text) || `Unidentified ${input.purpose ?? "card"} page ${page}`,
      sourceUrl: input.sourceUrl,
      sourcePage: page,
      provenance: [input.provenanceIndex ?? 0],
      extractedText: text,
      numbers,
      pageCount: parsedPdf.pageCount,
      reviewFlags: [
        ...(text ? [] : ["no-extractable-text"]),
        ...(numbers.length ? [] : ["no-numeric-fields-detected"]),
        "owner-review-required",
      ],
    };
  });
  const provenance = { kind: "owner-import", sourceName: "Atomic Mass Games card PDF", sourceUrl: input.sourceUrl, importedAt: input.importedAt ?? new Date().toISOString() };
  const units: Array<Record<string, unknown>> = [];
  return {
    gameId: input.gameId,
    provenance: [provenance],
    assets: [],
    records,
    units,
    candidates: [
      ...records.map((record) => ({ entityKind: "card", sourceId: `${input.sourceUrl}#page=${record.sourcePage}`, proposed: record } satisfies TextRecord)),
      ...units.map((unit) => ({ entityKind: "unit", sourceId: String(unit.sourceId), proposed: unit } satisfies TextRecord)),
    ],
    report: {
      pageCount: parsedPdf.pageCount,
      extractedCharacters: fullText.length,
      extractedNumericFields: records.reduce((sum, record) => sum + record.numbers.length, 0),
      cardCandidates: records.length,
      unitCandidates: units.length,
      warnings: [...new Set(records.flatMap(({ reviewFlags }) => reviewFlags))],
    },
  };
}

export const mcpStatCardCrops = [
  { position: "upper", x: 90, y: 100, width: 432, height: 292 },
  { position: "lower", x: 90, y: 403, width: 432, height: 292 },
] as const;

/** A–L page 1 has a taller title block; all later pages and the other two 2026 stat-card PDFs use the standard placement. */
export function mcpStatCardCropsForSource(sourceUrl: string, page: number) {
  const fileName = new URL(sourceUrl).pathname.split("/").at(-1)?.toLowerCase() ?? "";
  if (page === 1 && /statcards_a-l(?:-\d+)?\.pdf$/.test(fileName)) {
    return [
      { position: "upper", x: 90, y: 135, width: 432, height: 288 },
      { position: "lower", x: 90, y: 433, width: 432, height: 289 },
    ] as const;
  }
  return mcpStatCardCrops;
}

export function mcpCardPdfFormat(sourceUrl: string): "stat-cards" | "grunts" | "horsemen" {
  const fileName = new URL(sourceUrl).pathname.split("/").at(-1)?.toLowerCase() ?? "";
  if (fileName.includes("_grunt")) return "grunts";
  if (fileName.includes("_horsemen")) return "horsemen";
  return "stat-cards";
}

export function mcpGruntCardCrops(page: number) {
  const left = { position: "left", x: 105, y: 247, width: 177, height: 300 };
  const right = { position: "right", x: 330, y: 247, width: 177, height: 300 };
  return page === 3 ? [left] : page >= 1 && page <= 2 ? [left, right] : [];
}

/** MCP stat-card PDF template: each printed page contains healthy and injured sides. Crop the full card headings;
 * retain visible numbers at their positions because the stat icons are unlabeled in extracted text. */
async function parseMcpStatCardPdf(input: { gameId: GameId; sourceUrl: string; path: string; purpose?: "card" | "token"; importedAt?: string; provenanceIndex?: number; uploadAssets?: boolean }) {
  const parsed = await readPdfPageLines(input.path);
  const renderIterator = input.uploadAssets ? renderPdfPagePngs(input.path)[Symbol.asyncIterator]() : undefined;
  const assets: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const unitsByName = new Map<string, McpUnitDraft>();
  for (const page of parsed.pages) {
    const rendered = renderIterator ? await renderIterator.next() : undefined;
    if (renderIterator && (!rendered || rendered.done || rendered.value.page !== page.page)) throw new Error(`Could not render expected PDF page ${page.page}`);
    const sourceImage = rendered && !rendered.done ? rendered.value.png : undefined;
    const image = sourceImage ? await loadImage(Buffer.from(sourceImage)) : undefined;
    const crops = mcpStatCardCropsForSource(input.sourceUrl, page.page);
    const pageCards: Array<{ name: string; alias?: string; id: string; position: "upper" | "lower"; markers: Array<Record<string, number>>; profile: McpStatProfile; record: Record<string, unknown> }> = [];
    for (const crop of crops) {
      const xRatio = crop.x / 612;
      const yRatio = crop.y / 792;
      const widthRatio = crop.width / 612;
      const heightRatio = crop.height / 792;
      const inCrop = page.items.filter((item) => item.x / page.width >= xRatio && item.x / page.width <= xRatio + widthRatio && item.y / page.height >= yRatio && item.y / page.height <= yRatio + heightRatio);
      const text = linesFromItems(inCrop);
      const { name, alias } = titleFromMcpCard(inCrop, crop);
      const sourceId = `${input.sourceUrl}#page=${page.page}#${crop.position}`;
      const profile = extractMcpStatProfile({ items: page.items, crop, page: { width: page.width, height: page.height }, layout: "standard-stat-card", side: crop.position === "upper" ? "healthy" : "injured" });
      const { numericMarkers: markers, ...profileSummary } = profile;
      if (!name && !hasMcpCardContent(text, markers.length)) continue;
      const cardId = stableId("card", sourceId);
      let assetId: string | undefined;
      if (image) {
        assetId = await uploadPdfCardCrop({ image, pageWidth: page.width, pageHeight: page.height, crop, sourceId, assets, cropVersion: "stat-card-v2" });
      }
      const record = {
        id: cardId,
        name: name || `Unidentified card page ${page.page} ${crop.position}`,
        ...(alias ? { aliases: [alias] } : {}),
        sourceId,
        sourceUrl: input.sourceUrl,
        sourcePage: page.page,
        sidePosition: crop.position,
        provenance: [input.provenanceIndex ?? 0],
        ...(assetId ? { assetIds: [assetId] } : {}),
        cardText: text,
        numericMarkers: markers,
        statProfile: profileSummary,
        reviewFlags: [
          ...(name ? [] : ["no-card-name-extracted"]),
          ...profile.reviewFlags,
          ...(markers.length ? [] : ["no-numeric-markers-extracted"]),
          ...(!assetId ? ["private-image-upload-not-requested"] : []),
          "owner-review-required",
        ],
      };
      records.push(record);
      pageCards.push({ name, id: cardId, position: crop.position, markers, profile, record, ...(alias ? { alias } : {}) });
    }
    const named = pageCards.filter((face) => Boolean(face.name));
    const identityGroups = groupMcpFacesByIdentity(named);
    const pageHasIdentityMismatch = identityGroups.length > 1;
    for (const identityGroup of identityGroups) {
      const faces = identityGroup.faces;
      const key = identityGroup.key;
      const sourceId = identityGroup.sourceId;
      const unitId = stableId("unit", sourceId);
      const existing = unitsByName.get(key);
      const hasPairedSides = faces.length === 2 && new Set(faces.map(({ position }) => position)).size === 2;
      const profiles = faces.map(({ profile, id }) => {
        const summary = Object.fromEntries(Object.entries(profile).filter(([field]) => field !== "numericMarkers"));
        return { ...summary, sourceId: `${input.sourceUrl}#page=${page.page}#${cropPositionForProfile(profile.side)}`, cardId: id };
      });
      for (const face of faces) Object.assign(face.record, { unitId, associatedUnitId: unitId, ...(pageHasIdentityMismatch ? { reviewFlags: [...(Array.isArray(face.record.reviewFlags) ? face.record.reviewFlags : []), "card-sides-name-or-alter-ego-mismatch"] } : {}) });
      if (existing) {
        existing.cardIds.push(...faces.map(({ id }) => id));
        existing.statProfiles.push(...profiles);
        applyMcpProfileSummary(existing, existing.statProfiles as Array<Record<string, unknown>>);
        existing.sourceVariants[0]!.cardIds = [...existing.sourceVariants[0]!.cardIds as string[], ...faces.map(({ id }) => id)];
        if (!hasPairedSides && !existing.reviewFlags.includes("card-sides-not-paired")) existing.reviewFlags.push("card-sides-not-paired");
        if (pageHasIdentityMismatch && !existing.reviewFlags.includes("card-sides-name-or-alter-ego-mismatch")) existing.reviewFlags.push("card-sides-name-or-alter-ego-mismatch");
      } else {
        const alias = identityGroup.alias;
        const unit: McpUnitDraft = {
          id: unitId,
          name: identityGroup.name,
          characterName: identityGroup.name,
          sourceId,
          ...(alias ? { alterEgoName: alias, alterEgoId: normalizeName(alias) } : {}),
          provenance: [input.provenanceIndex ?? 0],
          cardIds: faces.map(({ id }) => id),
          sourceVariants: [{ sourceUrl: input.sourceUrl, cardIds: faces.map(({ id }) => id) }],
          aliases: alias ? [alias] : [],
          stats: {},
          statProfiles: profiles,
          reviewFlags: ["owner-confirm-unit-name", ...(!alias ? ["alter-ego-unverified"] : []), ...(!hasPairedSides ? ["card-sides-not-paired"] : []), ...(pageHasIdentityMismatch ? ["card-sides-name-or-alter-ego-mismatch"] : [])],
        };
        applyMcpProfileSummary(unit, profiles);
        unitsByName.set(key, unit);
      }
    }
  }
  if (renderIterator) await renderIterator.return(undefined);
  const units = [...unitsByName.values()];
  const sourceDate = input.importedAt ?? new Date().toISOString();
  return {
    gameId: input.gameId,
    provenance: [{ kind: "owner-import", sourceName: "Atomic Mass Games private stat-card PDF", sourceUrl: input.sourceUrl, importedAt: sourceDate }],
    assets,
    records,
    units,
    candidates: [
      ...records.map((record) => ({ entityKind: "card", sourceId: String(record.sourceId), proposed: record })),
      ...units.map((unit) => ({ entityKind: "unit", sourceId: String(unit.sourceId), proposed: unit })),
    ],
    report: {
      pageCount: parsed.pageCount,
      extractedCardSides: records.length,
      namedCardSides: records.filter(({ name }) => !String(name).startsWith("Unidentified ")).length,
      unitCandidates: units.length,
      uploadedCardImages: assets.length,
      warnings: ["MCP stats are structured only when the complete stat-panel geometry is verified; remaining card text and numeric markers are retained for owner review."],
    },
  };
}

function cropPositionForProfile(side: McpStatProfile["side"]): "upper" | "lower" {
  return side === "injured" ? "lower" : "upper";
}

function applyMcpProfileSummary(unit: McpUnitDraft, profiles: Array<Record<string, unknown>>) {
  const complete = profiles.filter((profile) => profile.profileCompleteness === "complete");
  const reviewFlags = [...new Set(profiles.flatMap((profile) => Array.isArray(profile.reviewFlags) ? profile.reviewFlags.map(String) : []))];
  const hasBothSides = complete.some((profile) => profile.side === "healthy") && complete.some((profile) => profile.side === "injured");
  unit.profileCompleteness = hasBothSides && complete.length === profiles.length ? "complete" : complete.length ? "partial" : "unverified";
  unit.reviewFlags = [...new Set([
    ...unit.reviewFlags.filter((flag) => flag !== "stat-icons-require-owner-entry" && flag !== "mcp-profile-some-sides-unverified" && flag !== "mcp-profile-side-pair-unconfirmed" && flag !== "mcp-profile-side-values-disagree" && !String(flag).startsWith("mcp-stat-panel-") && flag !== "mcp-profile-layout-unverified"),
    ...reviewFlags,
    ...(complete.length ? [] : ["stat-icons-require-owner-entry"]),
    ...(profiles.some((profile) => profile.profileCompleteness !== "complete") ? ["mcp-profile-some-sides-unverified"] : []),
    ...(!hasBothSides ? ["mcp-profile-side-pair-unconfirmed"] : []),
  ])];

  const consensus = (values: unknown[]) => {
    const defined = values.filter((value) => value !== undefined && value !== null);
    if (!defined.length) return { value: undefined, conflict: false };
    const encodings = new Set(defined.map((value) => JSON.stringify(value)));
    return encodings.size === 1 ? { value: defined[0], conflict: false } : { value: undefined, conflict: true };
  };
  const threat = consensus(complete.map((profile) => profile.threat));
  if (hasBothSides && typeof threat.value === "number") unit.threat = threat.value;
  else delete unit.threat;
  const stamina: Record<string, number> = {};
  let conflict = threat.conflict;
  for (const side of ["healthy", "injured"] as const) {
    const result = consensus(complete.filter((profile) => profile.side === side).map((profile) => profile.stamina));
    if (typeof result.value === "number") stamina[side] = result.value;
    conflict ||= result.conflict;
  }
  if (Object.keys(stamina).length) unit.stamina = stamina;
  else delete unit.stamina;

  const stats: Record<string, string | number | boolean> = {};
  if (hasBothSides) {
    for (const key of ["size", "movement"] as const) {
      const result = consensus(complete.map((profile) => (profile.stats as Record<string, unknown> | undefined)?.[key]));
      if (typeof result.value === "string" || typeof result.value === "number") stats[key] = result.value;
      conflict ||= result.conflict;
    }
    for (const key of ["physical", "energy", "mystic"] as const) {
      const result = consensus(complete.map((profile) => ((profile.stats as Record<string, unknown> | undefined)?.defenses as Record<string, unknown> | undefined)?.[key]));
      if (typeof result.value === "number") stats[`${key}Defense`] = result.value;
      conflict ||= result.conflict;
    }
  }
  unit.stats = stats;
  if (conflict) unit.reviewFlags = [...new Set([...unit.reviewFlags, "mcp-profile-side-values-disagree"])];
  else unit.reviewFlags = unit.reviewFlags.filter((flag) => flag !== "mcp-profile-side-values-disagree");
}

async function parseMcpGruntStatCardPdf(input: { gameId: GameId; sourceUrl: string; path: string; purpose?: "card" | "token"; importedAt?: string; provenanceIndex?: number; uploadAssets?: boolean }) {
  const parsed = await readPdfPageLines(input.path);
  const renderIterator = input.uploadAssets ? renderPdfPagePngs(input.path)[Symbol.asyncIterator]() : undefined;
  const assets: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const unitsByName = new Map<string, Record<string, unknown>>();
  for (const page of parsed.pages) {
    const rendered = renderIterator ? await renderIterator.next() : undefined;
    if (renderIterator && (!rendered || rendered.done || rendered.value.page !== page.page)) throw new Error(`Could not render expected PDF page ${page.page}`);
    const image = rendered && !rendered.done ? await loadImage(Buffer.from(rendered.value.png)) : undefined;
    for (const crop of mcpGruntCardCrops(page.page)) {
      const inCrop = page.items.filter((item) => item.x >= crop.x && item.x <= crop.x + crop.width && item.y >= crop.y && item.y <= crop.y + crop.height);
      const name = titleFromMcpCardRegion(inCrop, crop);
      if (!name) continue;
      const sourceId = `${input.sourceUrl}#page=${page.page}#${crop.position}`;
      const cardId = stableId("card", sourceId);
      let assetId: string | undefined;
      if (image) assetId = await uploadPdfCardCrop({ image, pageWidth: page.width, pageHeight: page.height, crop, sourceId, assets });
      const cardText = linesFromItems(inCrop);
      const card = {
        id: cardId,
        name,
        sourceId,
        sourceUrl: input.sourceUrl,
        sourcePage: page.page,
        sidePosition: crop.position,
        cardType: "unit-card",
        provenance: [input.provenanceIndex ?? 0],
        ...(assetId ? { assetIds: [assetId] } : {}),
        cardText,
        numericMarkers: inCrop.flatMap((item) => {
          const match = item.text.trim().match(/^\d{1,2}$/);
          return match ? [{ value: Number(match[0]), x: Math.round((item.x - crop.x) / crop.width * 1000) / 1000, y: Math.round((item.y - crop.y) / crop.height * 1000) / 1000 }] : [];
        }),
        reviewFlags: ["owner-review-required", "stat-icons-require-owner-entry", ...(!assetId ? ["private-image-upload-not-requested"] : [])],
      };
      records.push(card);
      const unitSourceId = `mcp:${normalizeName(name)}`;
      const existing = unitsByName.get(unitSourceId);
      if (existing) {
        (existing.cardIds as string[]).push(cardId);
        (existing.sourceVariants as Array<Record<string, unknown>>)[0]!.cardIds = [...(existing.sourceVariants as Array<Record<string, unknown>>)[0]!.cardIds as string[], cardId];
      } else {
        unitsByName.set(unitSourceId, {
          id: stableId("unit", unitSourceId),
          name,
          sourceId: unitSourceId,
          aliases: [],
          provenance: [input.provenanceIndex ?? 0],
          cardIds: [cardId],
          sourceVariants: [{ sourceUrl: input.sourceUrl, cardIds: [cardId] }],
          stats: {},
          profileCompleteness: "name-and-card-images-only",
          reviewFlags: ["unit-name-from-official-card-title", "stat-icons-require-owner-entry"],
        });
      }
    }
  }
  if (renderIterator) await renderIterator.return(undefined);
  const units = [...unitsByName.values()];
  return {
    gameId: input.gameId,
    provenance: [{ kind: "owner-import", sourceName: "Atomic Mass Games official Grunt stat-card PDF", sourceUrl: input.sourceUrl, importedAt: input.importedAt ?? new Date().toISOString() }],
    assets,
    records,
    units,
    candidates: [
      ...records.map((record) => ({ entityKind: "card", sourceId: String(record.sourceId), proposed: record } satisfies TextRecord)),
      ...units.map((unit) => ({ entityKind: "unit", sourceId: String(unit.sourceId), proposed: unit } satisfies TextRecord)),
    ],
    report: { pageCount: parsed.pageCount, extractedCardSides: records.length, namedCardSides: records.length, unitCandidates: units.length, uploadedCardImages: assets.length, warnings: ["Grunt cards are separate horizontal unit cards; each image was kept with its printed title and page reference."] },
  };
}

async function parseMcpHorsemenCardsPdf(input: { gameId: GameId; sourceUrl: string; path: string; purpose?: "card" | "token"; importedAt?: string; provenanceIndex?: number; uploadAssets?: boolean }) {
  const parsed = await readPdfPageLines(input.path);
  const renderIterator = input.uploadAssets ? renderPdfPagePngs(input.path)[Symbol.asyncIterator]() : undefined;
  const assets: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  for (const page of parsed.pages) {
    const rendered = renderIterator ? await renderIterator.next() : undefined;
    if (renderIterator && (!rendered || rendered.done || rendered.value.page !== page.page)) throw new Error(`Could not render expected PDF page ${page.page}`);
    const image = rendered && !rendered.done ? await loadImage(Buffer.from(rendered.value.png)) : undefined;
    for (const crop of mcpGruntCardCrops(page.page)) {
      const inCrop = page.items.filter((item) => item.x >= crop.x && item.x <= crop.x + crop.width && item.y >= crop.y && item.y <= crop.y + crop.height);
      const title = titleFromMcpCardRegion(inCrop, crop);
      if (!title) continue;
      const name = title;
      const sourceId = `${input.sourceUrl}#page=${page.page}#${crop.position}`;
      let assetId: string | undefined;
      if (image) assetId = await uploadPdfCardCrop({ image, pageWidth: page.width, pageHeight: page.height, crop, sourceId, assets });
      records.push({
        id: stableId("card", sourceId),
        name,
        sourceId,
        sourceUrl: input.sourceUrl,
        sourcePage: page.page,
        sidePosition: crop.position,
        cardType: page.page === 3 ? "leadership-card" : "ability-card",
        provenance: [input.provenanceIndex ?? 0],
        ...(assetId ? { assetIds: [assetId] } : {}),
        cardText: linesFromItems(inCrop),
        reviewFlags: ["card-only-no-figure-record-inferred", ...(!assetId ? ["private-image-upload-not-requested"] : [])],
      });
    }
  }
  if (renderIterator) await renderIterator.return(undefined);
  return {
    gameId: input.gameId,
    provenance: [{ kind: "owner-import", sourceName: "Atomic Mass Games official Horsemen card PDF", sourceUrl: input.sourceUrl, importedAt: input.importedAt ?? new Date().toISOString() }],
    assets,
    records,
    units: [],
    candidates: records.map((record) => ({ entityKind: "card", sourceId: String(record.sourceId), proposed: record } satisfies TextRecord)),
    report: { pageCount: parsed.pageCount, cardCandidates: records.length, unitCandidates: 0, uploadedCardImages: assets.length, warnings: ["Horsemen cards are character-assigned abilities; no unit or miniature records were created."] },
  };
}

export function titleFromMcpCardRegion(items: Array<{ text: string; x: number; y: number }>, crop: { x: number; y: number; width: number; height: number }) {
  const titleItems = items.filter((item) => {
    const x = (item.x - crop.x) / crop.width;
    const y = (item.y - crop.y) / crop.height;
    return x >= 0 && x <= 1 && y >= 0.04 && y <= 0.18 && /[A-Za-z]{2,}/.test(item.text);
  });
  const first = linesFromItems(titleItems).split("\n").map((line) => line.trim()).find(Boolean);
  return first?.replace(/\b[A-Z]{2,}\b/g, (word) => word[0] + word.slice(1).toLowerCase()).trim() ?? "";
}

type PrivateBlobOperations = {
  withPrefix(pathname: string): string;
  read(pathname: string): Promise<{ stream: ReadableStream<Uint8Array> | null } | null>;
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<{ pathname: string }>;
};

/** Stable content-addressed keys make retries safe and prevent reuse of a cropped asset from older geometry. */
export async function putHashVerifiedPrivateBlob(pathname: string, bytes: Uint8Array, contentType: string, operations?: PrivateBlobOperations) {
  const privateBlob = operations ? undefined : await import("@/lib/blob");
  const blob: PrivateBlobOperations = operations ?? {
    withPrefix: privateBlob!.withBlobPrefix,
    read: privateBlob!.readPrivateBlob,
    put: privateBlob!.putPrivateBlob,
  };
  const fullPath = blob.withPrefix(pathname);
  const expectedHash = stableSourceRevision(bytes);
  const verifyExisting = async () => {
    const existing = await blob.read(fullPath);
    if (!existing) return false;
    if (!existing.stream) throw new Error(`Private Blob read did not return bytes at ${fullPath}`);
    const existingBytes = new Uint8Array(await new Response(existing.stream).arrayBuffer());
    if (stableSourceRevision(existingBytes) !== expectedHash) throw new Error(`Private Blob content mismatch at ${fullPath}`);
    return true;
  };
  if (await verifyExisting()) return { pathname: fullPath };
  try {
    return await blob.put(pathname, bytes, contentType);
  } catch (error) {
    if (await verifyExisting()) return { pathname: fullPath };
    throw error;
  }
}

async function uploadPdfCardCrop(input: { image: ReturnType<typeof loadImage> extends Promise<infer T> ? T : never; pageWidth: number; pageHeight: number; crop: { x: number; y: number; width: number; height: number }; sourceId: string; assets: Array<Record<string, unknown>>; cropVersion?: string }) {
  const xRatio = input.crop.x / input.pageWidth;
  const yRatio = input.crop.y / input.pageHeight;
  const widthRatio = input.crop.width / input.pageWidth;
  const heightRatio = input.crop.height / input.pageHeight;
  const pxX = Math.round(input.image.width * xRatio);
  const pxY = Math.round(input.image.height * yRatio);
  const pxWidth = Math.round(input.image.width * widthRatio);
  const pxHeight = Math.round(input.image.height * heightRatio);
  const canvas = createCanvas(pxWidth, pxHeight);
  const context = canvas.getContext("2d");
  context.drawImage(input.image, pxX, pxY, pxWidth, pxHeight, 0, 0, pxWidth, pxHeight);
  const bytes = new Uint8Array(canvas.toBuffer("image/png"));
  const contentHash = stableSourceRevision(bytes);
  const cropVersion = input.cropVersion ?? "pdf-card-v2";
  const assetId = stableId("card-asset", `${input.sourceId}#${cropVersion}#${contentHash}`);
  const blobKey = `imports/mcp/card/${cropVersion}/${contentHash.slice(0, 24)}-${assetId}.png`;
  const stored = await putHashVerifiedPrivateBlob(blobKey, bytes, "image/png");
  input.assets.push({ id: assetId, kind: "card", ref: stored.pathname, mimeType: "image/png", sourceUrl: input.sourceId });
  return assetId;
}

export function titleFromMcpCard(items: Array<{ text: string; x: number; y: number }>, crop: { x: number; y: number; width: number; height: number }) {
  const titleZone = items.filter((item) => {
    const x = (item.x - crop.x) / crop.width;
    const y = (item.y - crop.y) / crop.height;
    return x >= 0 && x <= 0.27 && y >= 0 && y <= 0.3 && /[A-Za-z]{3,}/.test(item.text);
  });
  const lines = linesFromItems(titleZone).split("\n").map((line) => line.replace(/[^A-Za-z' -]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const title = titleCaseMcpHeading(lines[0]);
  const alias = titleCaseMcpHeading(lines[1]);
  if (!title || title.length > 60) return { name: "", alias: "" };
  return { name: title, alias: alias && alias.length <= 60 ? alias : "" };
}

export function hasMcpCardContent(text: string, numericMarkerCount: number): boolean {
  if (numericMarkerCount > 0) return true;
  const lines = text.split(/[\r\n]+/).map((line) => line.replace(/[©®™]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!lines.length) return false;
  const appearsToBeCopyrightCredit = /[©®™]/.test(text) && !/[.!?]/.test(text) && lines.every((line) => line.length < 28);
  return !appearsToBeCopyrightCredit;
}

function titleCaseMcpHeading(value?: string) {
  return value?.replace(/\b[A-Z]{2,}\b/g, (word) => word[0] + word.slice(1).toLowerCase());
}

export function extractNumericFields(text: string): Array<{ label: string; value: number; context: string }> {
  const results: Array<{ label: string; value: number; context: string }> = [];
  const lines = text.split(/[\r\n|•]+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z /'-]{1,30})\s*[:\-]?\s*(\d+(?:\.\d+)?)(?:\s*([+])?)$/);
    if (!match) continue;
    results.push({ label: match[1]!.trim(), value: Number(match[2]), context: line });
  }
  return results;
}

export async function readLimitedResponse(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`Source exceeds the ${maxBytes}-byte import limit`);
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("source exceeds importer limit");
        throw new Error(`Source exceeds the ${maxBytes}-byte import limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function inferTitle(text: string): string {
  return text.split(/\n|\||•/).map((line) => line.trim()).find((line) => line.length > 2 && line.length < 80 && !/^\d/.test(line)) ?? "";
}

function linesFromItems(items: Array<{ text: string; x: number; y: number }>) {
  const rows = new Map<number, Array<{ x: number; text: string }>>();
  for (const item of items) {
    const y = Math.round(item.y / 2) * 2;
    rows.set(y, [...(rows.get(y) ?? []), { x: item.x, text: item.text }]);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b)
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map(({ text }) => text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean).join("\n");
}

function hash(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 20); }
function sourceTitle(sourceUrl: string) {
  return decodeURIComponent(new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1) ?? "Imported source").replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("amg-import.ts")) {
  const command = process.argv[2];
  if (command === "fetch") {
    fetchAmgSources({}).then(({ manifestPath, fetched }) => console.log(`Fetched ${fetched.length} listed sources to ${manifestPath}`));
  } else if (command === "parse") {
    const prepare = process.argv[3] ? Promise.resolve({ manifestPath: process.argv[3], count: 0 }) : createLocalAmgManifest();
    const identityMapIndex = process.argv.indexOf("--identity-map");
    const identityMapPath = identityMapIndex >= 0 ? process.argv[identityMapIndex + 1] : undefined;
    prepare.then(({ manifestPath }) => parseAmgManifest(manifestPath, { uploadAssets: process.argv.includes("--upload-assets"), ...(identityMapPath ? { identityMapPath } : {}) })).then((items) => {
      for (const item of items) console.log(`${item.gameId}: ${item.candidates} review candidates at ${item.path}`);
    });
  } else {
    throw new Error("Usage: npx tsx scripts/importers/amg-import.ts <fetch|parse [manifest] [--upload-assets] [--identity-map <ignored-json>]>");
  }
}

function contentTypeForPath(path: string): string {
  if (path.toLowerCase().endsWith(".pdf")) return "application/pdf";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  if (path.toLowerCase().endsWith(".png")) return "image/png";
  if (path.toLowerCase().endsWith(".webp")) return "image/webp";
  if (path.toLowerCase().endsWith(".html")) return "text/html";
  return "application/octet-stream";
}
