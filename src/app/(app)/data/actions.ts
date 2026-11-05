"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { collectionItems, collectionOverrides, dataPacks, importCandidates, importRuns, packAssets } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { isGameId } from "@/lib/current-game";
import { createImportBundle, validateCataloguePack, type ImportCandidateDraft } from "../../../../scripts/importers/bundle";
import { applyCatalogueOverrides, isValidOverridePath } from "@/lib/catalogue-overrides";
import { stableSourceRevision } from "../../../../scripts/importers/matching";
import { canReviewPublishedCandidate, composeReviewedCatalogue, effectiveCatalogueRevision, isValidPointsValue, publishRunOnce, selectReviewedAssets } from "../../../../scripts/importers/publish-review";
import { headPrivateBlob, isBlobKey } from "@/lib/blob";
import { lockBlobKey } from "@/db/blob-lock";
import { isStandaloneCardReviewTarget, isValidAssetAssociationTarget, STANDALONE_CARD_TARGET_PREFIX } from "@/features/imports/standalone-card";
import { lockAndVerifyPrivateAssets } from "@/features/imports/private-asset-verification";

type ActionResult = { ok: true; message: string } | { ok: false; error: string };
const MAX_BUNDLE_BYTES = 3 * 1024 * 1024;

export async function stageImport(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return { ok: false, error: "unauthorised" };
  const upload = formData.get("bundle");
  if (!(upload instanceof File) || upload.size === 0 || upload.size > MAX_BUNDLE_BYTES) return { ok: false, error: upload instanceof File && upload.size > MAX_BUNDLE_BYTES ? "too-large" : "invalid-bundle" };
  try {
    const raw = JSON.parse(await upload.text()) as Record<string, unknown>;
    if (raw.sourceKind === "official-product-image-candidates") {
      if (!isGameId(String(raw.gameId)) || !Array.isArray(raw.candidates)) throw new Error("invalid-image-bundle");
      const candidates = raw.candidates.map((entry) => {
        if (!entry || typeof entry !== "object") throw new Error("invalid-image-candidate");
        const candidate = entry as Record<string, unknown>;
        if (candidate.entityKind !== "image" || typeof candidate.sourceId !== "string" || !candidate.proposed || typeof candidate.proposed !== "object") throw new Error("invalid-image-candidate");
        const proposed = candidate.proposed as Record<string, unknown>;
        if (typeof proposed.imageUrl !== "string" || !isSafeExternalImageUrl(proposed.imageUrl) || typeof proposed.productUrl !== "string" || !isSafeExternalImageUrl(proposed.productUrl)) throw new Error("invalid-image-url");
        return { sourceId: candidate.sourceId, proposed, matchTargetId: typeof candidate.matchTargetId === "string" ? candidate.matchTargetId : null, matchConfidence: typeof candidate.matchConfidence === "number" ? candidate.matchConfidence.toFixed(3) : null };
      });
      const report = raw.report && typeof raw.report === "object" ? raw.report as Record<string, unknown> : {};
      const fetchedAtValue = Array.isArray(report.fetchedAt) ? report.fetchedAt.find((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value))) : undefined;
      const staged = await db.transaction(async (tx) => {
        const [run] = await tx.insert(importRuns).values({ gameId: String(raw.gameId) as import("@/games/types").GameId, sourceKind: "official-product-image-candidates", sourceUrl: candidates.map(({ proposed }) => proposed.productUrl).find((value): value is string => typeof value === "string") ?? null, sourceRevision: stableSourceRevision(JSON.stringify(candidates)), sourceDate: null, fetchedAt: fetchedAtValue ? new Date(fetchedAtValue) : null, status: "review", report: { ...report, remoteReferencesOnly: true } }).returning({ id: importRuns.id });
        if (!run) throw new Error("run-insert-failed");
        if (candidates.length) await tx.insert(importCandidates).values(candidates.map((candidate) => ({ runId: run.id, entityKind: "image", sourceId: candidate.sourceId, proposed: candidate.proposed, matchTargetId: candidate.matchTargetId, matchConfidence: candidate.matchConfidence })));
        return run;
      });
      revalidatePath("/data");
      return { ok: true, message: `staged:${staged.id}:${candidates.length}` };
    }
    const isDirectPack = raw.schemaVersion === 1 && typeof raw.gameId === "string" && raw.catalogue && typeof raw.catalogue === "object";
    const packSource = raw.pack ?? (isDirectPack ? raw : undefined);
    const bundle = createImportBundle(packSource);
    const candidatesSource = Array.isArray(raw.candidates) ? raw.candidates : bundle.candidates;
    const isBattleProfilesBundle = raw.sourceKind === "aos-battle-profiles-candidates";
    if (!Array.isArray(candidatesSource)) throw new Error("invalid-candidates");
    const extraCandidates = isBattleProfilesBundle ? candidatesSource.filter((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>).entityKind === "points") as Array<Record<string, unknown>> : [];
    const normalCandidates = candidatesSource.filter((entry) => !entry || typeof entry !== "object" || (entry as Record<string, unknown>).entityKind !== "points");
    if (normalCandidates.length !== bundle.candidates.length || (isBattleProfilesBundle && extraCandidates.length !== candidatesSource.length - normalCandidates.length)) throw new Error("invalid-candidates");
    const byKey = new Map<string, ImportCandidateDraft>(bundle.candidates.map((candidate) => [`${candidate.entityKind}\0${candidate.sourceId}`, candidate]));
    const candidates: ImportCandidateDraft[] = normalCandidates.map((entry) => {
      if (!entry || typeof entry !== "object") throw new Error("invalid-candidate");
      const candidate = entry as Record<string, unknown>;
      const key = `${String(candidate.entityKind)}\0${String(candidate.sourceId)}`;
      const validated = byKey.get(key);
      if (!validated || !candidate.proposed || typeof candidate.proposed !== "object") throw new Error("invalid-candidate");
      return { ...validated, proposed: candidate.proposed as Record<string, unknown>, ...(typeof candidate.matchTargetId === "string" ? { matchTargetId: candidate.matchTargetId } : {}), ...(typeof candidate.matchConfidence === "number" ? { matchConfidence: candidate.matchConfidence } : {}) };
    });
    for (const entry of extraCandidates) {
      if (entry.entityKind !== "points" || typeof entry.sourceId !== "string" || !entry.proposed || typeof entry.proposed !== "object") throw new Error("invalid-points-candidate");
      const proposed = entry.proposed as Record<string, unknown>;
      if (typeof proposed.name !== "string" || !isValidPointsValue(proposed.points) || typeof proposed.sourceUrl !== "string" || !isSafeExternalImageUrl(proposed.sourceUrl)) throw new Error("invalid-points-candidate");
      candidates.push({ entityKind: "points", sourceId: entry.sourceId, proposed, ...(typeof entry.matchTargetId === "string" ? { matchTargetId: entry.matchTargetId } : {}), ...(typeof entry.matchConfidence === "number" ? { matchConfidence: entry.matchConfidence } : {}) });
    }
    const referencedAssetIds = new Set<string>();
    for (const entry of normalCandidates) {
      if (!entry || typeof entry !== "object") continue;
      const proposed = objectOrEmpty((entry as Record<string, unknown>).proposed);
      if (Array.isArray(proposed.assetIds)) for (const id of proposed.assetIds) if (typeof id === "string") referencedAssetIds.add(id);
    }
    for (const asset of bundle.pack.assets) {
      if (referencedAssetIds.has(asset.id)) continue;
      if (!["card", "token"].includes(asset.kind) || !isBlobKey(asset.ref)) continue;
      candidates.push({ entityKind: "asset", sourceId: asset.id, proposed: { id: asset.id, kind: asset.kind, ref: asset.ref, mimeType: asset.mimeType, sourceUrl: asset.sourceUrl, sourceDate: asset.sourceDate, reviewFlags: ["private-asset-owner-link-required"] } });
    }
    const report = raw.report && typeof raw.report === "object" ? raw.report as Record<string, unknown> : {};
    const assetCandidates = Array.isArray(raw.assetCandidates) ? raw.assetCandidates : [];
    const pack = bundle.pack;
    const sourceName = pack.provenance.find((item) => item.sourceName)?.sourceName ?? "";
    const sourceKind = typeof raw.sourceKind === "string" ? raw.sourceKind : /bsdata/i.test(sourceName) ? "bsdata" : pack.provenance.some((item) => item.kind === "manual") ? "manual" : pack.provenance.some((item) => item.sourceUrl) ? "official-source" : "owner-bundle";
    const parserReports = Array.isArray(objectOrEmpty(pack.constraints).parserReports) ? objectOrEmpty(pack.constraints).parserReports as Array<Record<string, unknown>> : [];
    const fetchedAtValue = parserReports.find((item) => typeof item.fetchedAt === "string")?.fetchedAt;
    const inserted = await db.transaction(async (tx) => {
      const [run] = await tx.insert(importRuns).values({
        gameId: pack.gameId,
        sourceKind,
        sourceUrl: pack.provenance.find((item) => item.sourceUrl)?.sourceUrl ?? null,
        sourceRevision: pack.revision,
        sourceDate: pack.provenance.find((item) => item.sourceDate)?.sourceDate ?? null,
        fetchedAt: typeof fetchedAtValue === "string" && Number.isFinite(Date.parse(fetchedAtValue)) ? new Date(fetchedAtValue) : null,
        status: "review",
        report: { ...report, packDraft: { schemaVersion: pack.schemaVersion, gameId: pack.gameId, packId: pack.packId, revision: pack.revision, publishedAt: pack.publishedAt, importedAt: pack.importedAt, provenance: pack.provenance, assets: pack.assets, constraints: pack.constraints }, assetCandidates },
      }).returning({ id: importRuns.id });
      if (!run) throw new Error("run-insert-failed");
      if (candidates.length) await tx.insert(importCandidates).values(candidates.map((candidate) => ({ runId: run.id, entityKind: candidate.entityKind, sourceId: candidate.sourceId, proposed: candidate.proposed, matchTargetId: candidate.matchTargetId ?? null, matchConfidence: candidate.matchConfidence?.toFixed(3) ?? null })));
      return { id: run.id, count: candidates.length };
    });
    revalidatePath("/data");
    return { ok: true, message: `staged:${inserted.id}:${inserted.count}` };
  } catch (error) {
    console.error("Could not stage catalogue import", error);
    return { ok: false, error: "invalid-bundle" };
  }
}

export async function saveCandidateReview(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return { ok: false, error: "unauthorised" };
  const id = positiveInt(formData.get("candidateId"));
  const proposedText = formData.get("proposed");
  const state = formData.get("reviewState");
  if (!id || typeof proposedText !== "string" || !["pending", "accepted", "rejected"].includes(String(state))) return { ok: false, error: "invalid-review" };
  try {
    const proposed = JSON.parse(proposedText) as unknown;
    if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) return { ok: false, error: "invalid-review" };
    const candidateRef = await db.select({ runId: importCandidates.runId }).from(importCandidates).where(eq(importCandidates.id, id)).limit(1);
    if (!candidateRef[0]) return { ok: false, error: "invalid-review" };
    await db.transaction(async (tx) => {
      const [run] = await tx.select().from(importRuns).where(eq(importRuns.id, candidateRef[0]!.runId)).for("update").limit(1);
      const [candidate] = await tx.select().from(importCandidates).where(eq(importCandidates.id, id)).for("update").limit(1);
      if (!run || !candidate || candidate.runId !== run.id) throw new Error("invalid-review");
      if (!canReviewPublishedCandidate(run.status, candidate.entityKind)) throw new Error("invalid-review");
      const target = String(formData.get("matchTargetId") ?? "").trim() || null;
      if (state === "accepted" && target?.startsWith(STANDALONE_CARD_TARGET_PREFIX) && !isStandaloneCardReviewTarget(candidate.entityKind, objectOrEmpty(proposed).id, target)) throw new Error("invalid-review");
      if (state === "accepted" && (["image", "points", "asset", "token"].includes(candidate.entityKind) || (["card", "token"].includes(candidate.entityKind) && hasAssets(proposed))) && !target) throw new Error("asset-unmatched");
      if (state === "accepted" && ["asset", "token"].includes(candidate.entityKind) && (typeof (proposed as Record<string, unknown>).ref !== "string" || !isBlobKey(String((proposed as Record<string, unknown>).ref)))) throw new Error("invalid-review");
      if (state === "accepted" && candidate.entityKind === "image") {
        const imageUrl = objectOrEmpty(proposed).imageUrl;
        const productUrl = objectOrEmpty(proposed).productUrl;
        if (typeof imageUrl !== "string" || !isSafeExternalImageUrl(imageUrl) || typeof productUrl !== "string" || !isSafeExternalImageUrl(productUrl) || !target) throw new Error("invalid-review");
        await tx.insert(collectionOverrides).values({ gameId: run.gameId, targetId: target, field: "image.reference", value: { url: imageUrl, sourceUrl: productUrl, sourceName: "Official product image" }, reason: "Owner accepted official product image reference" }).onConflictDoNothing({ target: [collectionOverrides.gameId, collectionOverrides.targetId, collectionOverrides.field] });
      }
      const confidence = String(formData.get("matchConfidence") ?? "").trim();
      const parsedConfidence = confidence ? Number(confidence) : null;
      if (parsedConfidence !== null && (!Number.isFinite(parsedConfidence) || parsedConfidence < 0 || parsedConfidence > 1)) throw new Error("invalid-review");
      await tx.update(importCandidates).set({
        proposed: proposed as Record<string, unknown>,
        matchTargetId: target,
        matchConfidence: parsedConfidence === null ? null : parsedConfidence.toFixed(3),
        reviewerNote: String(formData.get("reviewerNote") ?? "").trim() || null,
        reviewState: String(state),
        reviewedAt: state === "pending" ? null : new Date(),
      }).where(eq(importCandidates.id, id));
      if (candidate.entityKind === "image" && run.status === "review") {
        const remaining = await tx.select({ reviewState: importCandidates.reviewState }).from(importCandidates).where(eq(importCandidates.runId, candidate.runId));
        await tx.update(importRuns).set({ status: remaining.some((item) => item.reviewState === "pending") ? "review" : "accepted" }).where(eq(importRuns.id, candidate.runId));
      }
    });
    revalidatePath("/data");
    return { ok: true, message: "saved" };
  } catch (error) {
    return { ok: false, error: error instanceof Error && ["asset-unmatched", "invalid-review"].includes(error.message) ? error.message : "invalid-review" };
  }
}

export async function reviewCandidatesBatch(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return { ok: false, error: "unauthorised" };
  const runId = positiveInt(formData.get("runId"));
  const state = String(formData.get("reviewState") ?? "");
  let ids: number[];
  try { ids = JSON.parse(String(formData.get("candidateIds") ?? "[]")); }
  catch { return { ok: false, error: "invalid-review" }; }
  if (!runId || !["accepted", "rejected"].includes(state) || !Array.isArray(ids) || ids.length === 0 || ids.length > 1000 || ids.some((id) => !Number.isInteger(id) || id < 1)) return { ok: false, error: "invalid-review" };
  try {
    await db.transaction(async (tx) => {
      const [run] = await tx.select().from(importRuns).where(eq(importRuns.id, runId)).for("update").limit(1);
      if (!run || run.status !== "review") throw new Error("invalid-run");
      const candidates = await tx.select().from(importCandidates).where(and(eq(importCandidates.runId, runId), inArray(importCandidates.id, ids))).for("update");
      if (candidates.length !== ids.length) throw new Error("invalid-review");
      if (state === "accepted" && candidates.some((candidate) => {
        if (["image", "asset", "token"].includes(candidate.entityKind)) return true;
        if (candidate.entityKind === "points") return !candidate.matchTargetId || candidate.matchConfidence !== "1.000" || !isValidPointsValue(objectOrEmpty(candidate.proposed).points);
        if (candidate.entityKind === "card" && hasAssets(candidate.proposed)) return !candidate.matchTargetId || candidate.matchConfidence !== "1.000";
        return candidate.matchTargetId !== null && !(candidate.entityKind === "card" && candidate.matchConfidence === "1.000");
      })) throw new Error("individual-match-required");
      await tx.update(importCandidates).set({ reviewState: state, reviewedAt: new Date() }).where(and(eq(importCandidates.runId, runId), inArray(importCandidates.id, ids)));
      if (candidates.some((candidate) => candidate.entityKind === "image")) {
        const remaining = await tx.select({ reviewState: importCandidates.reviewState }).from(importCandidates).where(eq(importCandidates.runId, runId));
        await tx.update(importRuns).set({ status: remaining.some((item) => item.reviewState === "pending") ? "review" : "accepted" }).where(eq(importRuns.id, runId));
      }
    });
    revalidatePath("/data");
    return { ok: true, message: "saved" };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message === "individual-match-required" ? error.message : "invalid-review" };
  }
}

export async function publishReviewedRun(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return { ok: false, error: "unauthorised" };
  const runId = positiveInt(formData.get("runId"));
  if (!runId) return { ok: false, error: "invalid-run" };
  try {
    const result = await publishRunOnce(db, runId, {
      lockRun: async (tx, id) => {
        const [run] = await tx.select().from(importRuns).where(eq(importRuns.id, id)).for("update").limit(1);
        return run;
      },
      publish: async (tx, run) => {
      const candidates = await tx.select().from(importCandidates).where(eq(importCandidates.runId, runId)).orderBy(asc(importCandidates.id));
      if (candidates.some((candidate) => candidate.reviewState === "pending")) throw new Error("pending");
      const accepted = candidates.filter((candidate) => candidate.reviewState === "accepted");
      const report = objectOrEmpty(run.report);
      const packDraft = objectOrEmpty(report.packDraft);
      const assets = Array.isArray(packDraft.assets) ? packDraft.assets as Array<Record<string, unknown>> : [];
      const { catalogue, acceptedAssetIds } = composeReviewedCatalogue(accepted.map((candidate) => ({ entityKind: candidate.entityKind, sourceId: candidate.sourceId, matchTargetId: candidate.matchTargetId, proposed: objectOrEmpty(candidate.proposed) })));
      if (!Object.values(catalogue).some((section) => Array.isArray(section) && section.length > 0)) throw new Error("no-records");
      const unitIds = new Set((catalogue.units as Array<Record<string, unknown>>).map((unit) => String(unit.id)));
      const imageAssets = assets.filter((asset) => asset.kind === "card" || asset.kind === "token");
      const publishedAssets = selectReviewedAssets(assets, acceptedAssetIds);
      const assetRows: Array<{ unitId: string; kind: "card" | "token"; blobKey: string; sourceUrl: string; sourceName: string | null }> = [];
      for (const asset of imageAssets.filter((item) => acceptedAssetIds.has(String(item.id)))) {
        const assetId = String(asset.id ?? "");
        const ref = String(asset.ref ?? "");
        if (!isBlobKey(ref)) throw new Error("asset-not-private");
        const linkedCandidates = accepted.filter((candidate) => ["card", "token"].includes(candidate.entityKind) && hasAssetId(candidate.proposed, assetId)).map((candidate) => ({ entityKind: candidate.entityKind, matchTargetId: candidate.matchTargetId, proposed: objectOrEmpty(candidate.proposed) }));
        const linked = linkedCandidates[0];
        const directAsset = accepted.find((candidate) => ["asset", "token"].includes(candidate.entityKind) && candidate.sourceId === assetId);
        if (!linked && !directAsset) throw new Error("asset-unreviewed");
        if (linked?.matchTargetId && directAsset?.matchTargetId && linked.matchTargetId !== directAsset.matchTargetId) throw new Error("asset-match-conflict");
        const targetId = directAsset?.matchTargetId ?? linked?.matchTargetId;
        if (!targetId || !isValidAssetAssociationTarget(targetId, unitIds, linkedCandidates)) throw new Error("asset-unmatched");
        assetRows.push({ unitId: targetId, kind: asset.kind as "card" | "token", blobKey: ref, sourceUrl: String(asset.sourceUrl ?? run.sourceUrl ?? "owner-upload"), sourceName: String(asset.sourceName ?? "Private imported asset") });
      }
      const draft = {
        schemaVersion: 1,
        gameId: run.gameId,
        packId: String(packDraft.packId ?? `${run.gameId}-import-${run.id}`),
        revision: stableSourceRevision(JSON.stringify({ sourceRevision: packDraft.revision, catalogue, assets: publishedAssets, constraints: packDraft.constraints })),
        ...(typeof packDraft.publishedAt === "string" ? { publishedAt: packDraft.publishedAt } : {}),
        importedAt: String(packDraft.importedAt ?? run.createdAt.toISOString()),
        provenance: Array.isArray(packDraft.provenance) ? packDraft.provenance : [],
        assets: publishedAssets,
        catalogue,
        constraints: objectOrEmpty(packDraft.constraints),
      };
      const validated = validateCataloguePack(draft);
      const overrides = await tx.select().from(collectionOverrides).where(eq(collectionOverrides.gameId, run.gameId));
      const overridden = applyCatalogueOverrides(validated as typeof validated & { catalogue?: Record<string, unknown> }, overrides.map((override) => ({ targetId: override.targetId, field: override.field, value: override.value })));
      const content = validateCataloguePack({ ...overridden, revision: effectiveCatalogueRevision(overridden, stableSourceRevision) });
      const [pack] = await tx.insert(dataPacks).values({ gameId: run.gameId, source: run.sourceKind, sourceDate: run.sourceDate ?? "unknown", content }).returning({ id: dataPacks.id });
      if (!pack) throw new Error("publish-failed");
      await lockAndVerifyPrivateAssets(tx, assetRows, {
        lock: lockBlobKey,
        head: headPrivateBlob,
        concurrency: 16,
      });
      for (const row of assetRows) await tx.insert(packAssets).values({ packId: pack.id, unitId: row.unitId, kind: row.kind, blobKey: row.blobKey, sourceUrl: row.sourceUrl, sourceName: row.sourceName });
      return { packId: pack.id, game: run.gameId };
      },
      markAccepted: async (tx, id) => {
        await tx.update(importRuns).set({ status: "accepted" }).where(eq(importRuns.id, id));
      },
    });
    revalidatePath("/data");
    return { ok: true, message: `published:${result.packId}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "publish-failed";
    return { ok: false, error: message };
  }
}

export async function linkCollectionUnit(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return { ok: false, error: "unauthorised" };
  const itemId = positiveInt(formData.get("itemId"));
  const targetId = String(formData.get("unitId") ?? "").trim();
  if (!itemId || !targetId) return { ok: false, error: "invalid-match" };
  try {
    const [item] = await db.select().from(collectionItems).where(eq(collectionItems.id, itemId)).limit(1);
    if (!item) return { ok: false, error: "invalid-match" };
    const packs = await db.select().from(dataPacks).where(eq(dataPacks.gameId, item.gameId));
    const found = packs.some((pack) => {
      const content = objectOrEmpty(pack.content);
      const catalogue = objectOrEmpty(content.catalogue);
      return Array.isArray(catalogue.units) && catalogue.units.some((unit) => objectOrEmpty(unit).id === targetId);
    });
    if (!found) return { ok: false, error: "invalid-match" };
    await db.update(collectionItems).set({ unitId: targetId, updatedAt: new Date() }).where(and(eq(collectionItems.id, itemId), eq(collectionItems.gameId, item.gameId)));
    revalidatePath("/data");
    revalidatePath("/collection");
    return { ok: true, message: "linked" };
  } catch {
    return { ok: false, error: "invalid-match" };
  }
}

export async function saveCatalogueOverride(formData: FormData): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return { ok: false, error: "unauthorised" };
  const gameId = String(formData.get("gameId") ?? "");
  const targetId = String(formData.get("targetId") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim();
  const rawValue = String(formData.get("value") ?? "");
  if (!isGameId(gameId) || !targetId || !isValidOverridePath(field)) return { ok: false, error: "invalid-override" };
  try {
    const value = JSON.parse(rawValue) as unknown;
    const [existingPacks, existingOverrides] = await Promise.all([
      db.select({ content: dataPacks.content }).from(dataPacks).where(eq(dataPacks.gameId, gameId)),
      db.select().from(collectionOverrides).where(eq(collectionOverrides.gameId, gameId)),
    ]);
    const matching = existingPacks.filter(({ content }) => catalogueContainsTarget(content, targetId));
    if (!matching.length) return { ok: false, error: "invalid-override" };
    const overrides = existingOverrides.filter((item) => item.targetId !== targetId || item.field !== field).map((item) => ({ targetId: item.targetId, field: item.field, value: item.value }));
    overrides.push({ targetId, field, value });
    for (const pack of matching) validateCataloguePack(applyCatalogueOverrides(pack.content as { catalogue?: Record<string, unknown> }, overrides));
    await db.insert(collectionOverrides).values({ gameId, targetId, field, value, reason: String(formData.get("reason") ?? "").trim() || null }).onConflictDoUpdate({ target: [collectionOverrides.gameId, collectionOverrides.targetId, collectionOverrides.field], set: { value, reason: String(formData.get("reason") ?? "").trim() || null, updatedAt: new Date() } });
    revalidatePath("/data");
    return { ok: true, message: "saved" };
  } catch {
    return { ok: false, error: "invalid-override" };
  }
}

function positiveInt(value: FormDataEntryValue | null) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : undefined; }
function objectOrEmpty(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function catalogueContainsTarget(value: unknown, targetId: string) {
  const catalogue = objectOrEmpty(objectOrEmpty(value).catalogue);
  return Object.values(catalogue).some((records) => Array.isArray(records) && records.some((record) => objectOrEmpty(record).id === targetId));
}
function hasAssets(value: unknown) { return Array.isArray(objectOrEmpty(value).assetIds) && (objectOrEmpty(value).assetIds as unknown[]).length > 0; }
function hasAssetId(value: unknown, id: string) { return (objectOrEmpty(value).assetIds as unknown[] | undefined)?.includes(id) ?? false; }
function isSafeExternalImageUrl(value: string) {
  try {
    const url = new URL(value);
    const allowed = ["warhammer.com", "warhammer-community.com", "atomicmassgames.com", "knightmodels.com", "cdn.svc.asmodee.net", "cdn.shopify.com"];
    return url.protocol === "https:" && !url.username && !url.password && allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}
