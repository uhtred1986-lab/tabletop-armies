import { asc, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems, collectionOverrides, dataPacks, importCandidates, importRuns, packAssets } from "@/db/schema";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { getT } from "@/i18n/server";
import { getLocale } from "@/i18n/server";
import { strings } from "@/i18n";
import { DataWorkbench } from "./DataWorkbench";
import type { GameId } from "@/games/types";
import { suggestNameMatches } from "../../../../scripts/importers/matching";

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const t = await getT();
  const locale = await getLocale();
  const [runRows, packsRows, collectionRows, overridesRows] = await Promise.all([
    db.select().from(importRuns).orderBy(desc(importRuns.createdAt)),
    db.select().from(dataPacks).orderBy(desc(dataPacks.importedAt)),
    db.select().from(collectionItems).orderBy(asc(collectionItems.gameId), asc(collectionItems.unitName)),
    db.select().from(collectionOverrides).orderBy(asc(collectionOverrides.gameId), asc(collectionOverrides.targetId)),
  ]);
  const candidatesByRun = new Map<number, typeof importCandidates.$inferSelect[]>();
  if (runRows.length) {
    const candidateRows = await db.select().from(importCandidates).where(inArray(importCandidates.runId, runRows.map(({ id }) => id))).orderBy(asc(importCandidates.id));
    for (const candidate of candidateRows) candidatesByRun.set(candidate.runId, [...(candidatesByRun.get(candidate.runId) ?? []), candidate]);
  }
  const assetCounts = new Map<number, number>();
  if (packsRows.length) {
    const assets = await db.select({ packId: packAssets.packId }).from(packAssets).where(inArray(packAssets.packId, packsRows.map(({ id }) => id)));
    for (const asset of assets) assetCounts.set(asset.packId, (assetCounts.get(asset.packId) ?? 0) + 1);
  }
  const games: Array<{ id: GameId; key: string }> = [
    { id: "aos", key: "game.aos.name" }, { id: "mcp", key: "game.mcp.name" }, { id: "legion", key: "game.legion.name" }, { id: "shatterpoint", key: "game.shatterpoint.name" }, { id: "bmg", key: "game.bmg.name" },
  ];
  return <>
    <SceneBackdrop area="data" />
    <h1 className="w-display page-title">{t("data.title")}</h1>
    <p className="lead">{t("data.intro")}</p>
    <DataWorkbench
      t={Object.fromEntries(Object.keys(strings[locale]).map((key) => [key, t(key as never)]))}
      runs={runRows.map((run) => ({ id: run.id, gameId: run.gameId, status: run.status, sourceKind: run.sourceKind, sourceUrl: run.sourceUrl, sourceRevision: run.sourceRevision, createdAt: run.createdAt.toISOString(), candidates: (candidatesByRun.get(run.id) ?? []).map((candidate) => ({ ...candidate, proposed: record(candidate.proposed) })) }))}
      packs={packsRows.map((pack) => ({ id: pack.id, gameId: pack.gameId, source: pack.source, sourceDate: pack.sourceDate, units: catalogueUnits(pack.content), assetCount: assetCounts.get(pack.id) ?? 0 }))}
      rows={collectionRows.map(({ id, gameId, unitName, unitId }) => {
        const targets = packsRows.filter((pack) => pack.gameId === gameId).flatMap((pack) => catalogueUnits(pack.content));
        return { id, gameId, unitName, unitId, suggestions: suggestNameMatches(unitName, targets).map(({ target, confidence, exact }) => ({ id: target.id, name: target.name, confidence, exact })) };
      })}
      overrides={overridesRows.map(({ gameId, targetId, field, reason }) => ({ gameId, targetId, field, reason }))}
      games={games.map(({ id, key }) => ({ id, name: t(key as never) }))}
    />
  </>;
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function catalogueUnits(value: unknown) {
  const catalogue = record(record(value).catalogue);
  return Array.isArray(catalogue.units) ? catalogue.units.flatMap((unit) => {
    const candidate = record(unit);
    return typeof candidate.id === "string" && typeof candidate.name === "string" ? [{ id: candidate.id, name: candidate.name }] : [];
  }) : [];
}
