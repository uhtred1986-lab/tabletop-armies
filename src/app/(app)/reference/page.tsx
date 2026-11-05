import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems, collectionModels, collectionOverrides, dataPacks } from "@/db/schema";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { getT } from "@/i18n/server";
import type { StringKey } from "@/i18n";
import { games } from "@/games/registry";
import type { GameId } from "@/games/types";
import { applyCatalogueOverrides } from "@/lib/catalogue-overrides";
import { figureInCollection, latestReferenceRecords, referenceFamilies, referenceFamily, referenceRecordMatches, type FigureSuggestion, type ReferenceFamily, type ReferenceRecord } from "@/features/reference/domain";
import styles from "@/features/reference/reference.module.css";

export const dynamic = "force-dynamic";

const familyLabels: Record<ReferenceFamily, StringKey> = {
  legendary_encounters: "reference.family.legendaryEncounters",
  key_operations: "reference.family.keyOperations",
  crisis_events: "reference.family.crisisEvents",
  ultimate_encounters: "reference.family.ultimateEncounters",
  one_shots: "reference.family.oneShots",
};
function gameName(gameId: string, t: (key: StringKey) => string) {
  const game = games.find((entry) => entry.id === gameId);
  return game ? t(game.nameKey as StringKey) : gameId;
}

export default async function ReferencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [t, params] = await Promise.all([getT(), searchParams]);
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 160) : "";
  const requestedGame = typeof params.gameId === "string" ? params.gameId : params.game;
  const game = typeof requestedGame === "string" && games.some((entry) => entry.id === requestedGame) ? requestedGame : "";
  const recordId = typeof params.recordId === "string" ? params.recordId.slice(0, 180) : "";
  const kind = params.type === "mode" || params.type === "scenario" ? params.type : "";
  const family = referenceFamilies.find((value) => value === params.family) ?? "";
  const [packs, ownedModels, overrides] = await Promise.all([
    game ? db.select().from(dataPacks).where(eq(dataPacks.gameId, game as GameId)).orderBy(desc(dataPacks.sourceDate), desc(dataPacks.importedAt), desc(dataPacks.id)) : db.select().from(dataPacks).orderBy(desc(dataPacks.sourceDate), desc(dataPacks.importedAt), desc(dataPacks.id)),
    game ? db.select({ gameId: collectionItems.gameId, itemId: collectionItems.id, unitId: collectionItems.unitId, unitName: collectionItems.unitName }).from(collectionModels).innerJoin(collectionItems, eq(collectionModels.itemId, collectionItems.id)).where(eq(collectionItems.gameId, game as GameId)) : db.select({ gameId: collectionItems.gameId, itemId: collectionItems.id, unitId: collectionItems.unitId, unitName: collectionItems.unitName }).from(collectionModels).innerJoin(collectionItems, eq(collectionModels.itemId, collectionItems.id)),
    game ? db.select().from(collectionOverrides).where(eq(collectionOverrides.gameId, game as GameId)) : db.select().from(collectionOverrides),
  ]);
  const overriddenPacks = packs.map((pack) => {
    const content = pack.content as { catalogue?: Record<string, unknown>; [key: string]: unknown };
    const packOverrides = overrides.filter((override) => override.gameId === pack.gameId).map((override) => ({ targetId: override.targetId, field: override.field, value: override.value }));
    return { ...pack, content: { ...content, ...applyCatalogueOverrides({ catalogue: content.catalogue }, packOverrides) } };
  });
  const allRecords = latestReferenceRecords(overriddenPacks);
  const records = allRecords.filter((record) => (!game || record.gameId === game) && (!recordId || record.id === recordId) && (!kind || record.kind === kind) && (!family || referenceFamily(record) === family) && referenceRecordMatches(record, search));
  const collectionByGame = new Map<string, typeof ownedModels>();
  for (const item of ownedModels) collectionByGame.set(item.gameId, [...(collectionByGame.get(item.gameId) ?? []), item]);
  const tfn = (key: StringKey, values?: Record<string, string | number>) => t(key, values);
  function available(record: ReferenceRecord, figure: FigureSuggestion) {
    const items = collectionByGame.get(record.gameId) ?? [];
    return figureInCollection(figure, items);
  }
  return <>
    <SceneBackdrop area="data" />
    <h1 className="w-display page-title">{t("reference.title")}</h1>
    <p>{t("reference.intro")}</p>
    <div className="w-rule" />
    <section className="w-card card-pad">
      <form method="get" className={styles.filters}>
        {recordId && <input type="hidden" name="recordId" value={recordId} />}
        <label className={styles.field}><span className="label">{t("reference.search")}</span><input type="search" name="q" defaultValue={search} maxLength={160} /></label>
        <label className={styles.field}><span className="label">{t("reference.game")}</span><select name="gameId" defaultValue={game}><option value="">{t("reference.allGames")}</option>{games.map((entry) => <option key={entry.id} value={entry.id}>{gameName(entry.id, tfn)}</option>)}</select></label>
        <label className={styles.field}><span className="label">{t("reference.type")}</span><select name="type" defaultValue={kind}><option value="">{t("reference.allTypes")}</option><option value="mode">{t("reference.mode")}</option><option value="scenario">{t("reference.scenario")}</option></select></label>
        <label className={styles.field}><span className="label">{t("reference.family")}</span><select name="family" defaultValue={family}><option value="">{t("reference.allFamilies")}</option>{referenceFamilies.map((value) => <option key={value} value={value}>{t(familyLabels[value])}</option>)}</select></label>
        <div className={styles.actions}><button className={styles.button} type="submit">{t("reference.searchButton")}</button><Link className={styles.button} href="/reference">{t("reference.clear")}</Link></div>
      </form>
    </section>
    {records.length === 0 ? <section className={`w-card card-pad ${styles.results}`}><p>{t("reference.empty")}</p>{game && allRecords.length === 0 && <p className={styles.muted}>{t("reference.unconfigured")}</p>}</section> : (
      <div className={styles.results}>
        {records.map((record) => <article className={`w-card card-pad ${styles.record}`} key={`${record.gameId}:${record.kind}:${record.id}`}>
          <header>
            <div className={styles.meta}><span className="label">{record.kind === "mode" ? t("reference.mode") : t("reference.scenario")}</span><span className={styles.tag}>{gameName(record.gameId, tfn)}</span>{record.tags.map((tag) => <span className={styles.tag} key={tag}>{tag}</span>)}</div>
            <h2 className="card-title">{record.name}</h2>
            {record.modeType && <p className={styles.modeType}>{record.modeType}</p>}
            <details className={styles.provenance}><summary>{t("reference.sourceDetails")}</summary><div className={styles.provenanceBody}><span><strong>{t("reference.source")}:</strong> {record.source}</span><span><strong>{t("reference.sourceDate")}:</strong> {record.sourceDate}</span><span><strong>{t("reference.packRevision")}:</strong> {record.packRevision}</span><span><strong>{t("reference.packImportedAt")}:</strong> {record.packImportedAt.slice(0, 10)}</span>{record.sourceUrl && <a className={styles.source} href={record.sourceUrl} target="_blank" rel="noreferrer">{t("reference.openSource")}</a>}</div></details>
          </header>
          {record.summary && <section><h3>{t("reference.summary")}</h3><p>{record.summary}</p></section>}
          {record.sections.length > 0 && <details className={styles.sourceSections}><summary>{t("reference.openSections", { count: record.sections.length })}</summary><h3>{t("reference.sections")}</h3><div className={styles.sectionList}>{record.sections.map((section) => <section className={styles.section} key={section.id}><h4>{section.title}</h4><p>{section.text}</p>{Array.isArray(section.sourcePages) && section.sourcePages.length > 0 && <small>{t("reference.sourcePages", { pages: section.sourcePages.filter((page) => typeof page === "string" || typeof page === "number").join(", ") })}</small>}{section.sourceRef && <small> · {t("reference.sourceRef", { reference: section.sourceRef })}</small>}</section>)}</div></details>}
          {record.figures.length > 0 && <section><h3>{t("reference.figures")}</h3><div className={styles.figures}>{record.figures.map((figure, index) => {
            const strength = figure.strength === "required" ? t("reference.required") : figure.strength === "suggested" ? t("reference.suggested") : t("reference.optional");
            const found = available(record, figure);
            const statusText = found.status === "confirmed" ? t("reference.available") : found.status === "name_match" ? t("reference.nameMatch") : t("reference.notAvailable");
            return <div className={styles.figure} key={`${figure.unitId ?? figure.figureName}:${index}`}><h4>{figure.figureName ?? figure.unitId}</h4><div className={styles.meta}><span className={styles.tag}>{strength}</span><span>{statusText}</span>{found.models > 0 && <span>{t("reference.modelCount", { count: found.models })}</span>}{figure.sourceRef && <small>{t("reference.sourceRef", { reference: figure.sourceRef })}</small>}</div>{figure.rationale && <p>{figure.rationale}</p>}</div>;
          })}</div><p><Link href="/collection" className={styles.muted}>{t("reference.collectionLink")}</Link></p></section>}
          {record.missingSections.length > 0 && <details className={styles.technical}><summary>{t("reference.missingSectionsCount", { count: record.missingSections.length })}</summary><ul>{record.missingSections.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul></details>}
          {record.reviewFlags.length > 0 && <details className={styles.technical}><summary>{t("reference.reviewFlagsCount", { count: record.reviewFlags.length })}</summary><ul>{record.reviewFlags.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul></details>}
        </article>)}
      </div>
    )}
  </>;
}
