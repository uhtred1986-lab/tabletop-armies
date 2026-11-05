import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { db } from "@/db";
import { dataPacks, packAssets } from "@/db/schema";
import { getT } from "@/i18n/server";
import type { StringKey } from "@/i18n";
import { isBlobKey } from "@/lib/blob";
import { humanize, presentExtractedCardFields, presentUnitProfile } from "@/features/imports/profile-summary";
import { cardsForUnit, unitImageReferences } from "@/features/imports/card-associations";
import { groupStandaloneCardAssets } from "@/features/imports/standalone-card";

export const dynamic = "force-dynamic";

export default async function PackCardsPage({ params, searchParams }: { params: Promise<{ packId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getT();
  const [{ packId: rawId }, query] = await Promise.all([params, searchParams]);
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 120) : "";
  const requestedLimit = typeof query.limit === "string" ? Number(query.limit) : 60;
  const limit = Number.isFinite(requestedLimit) ? Math.min(300, Math.max(60, Math.floor(requestedLimit / 60) * 60)) : 60;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const [pack] = await db.select().from(dataPacks).where(eq(dataPacks.id, id)).limit(1);
  if (!pack) notFound();
  const assets = await db.select().from(packAssets).where(eq(packAssets.packId, id)).orderBy(asc(packAssets.unitId), asc(packAssets.kind), asc(packAssets.id));
  const content = record(pack.content);
  const catalogue = record(content.catalogue);
  const units = Array.isArray(catalogue.units) ? catalogue.units.map(record) : [];
  const cards = Array.isArray(catalogue.cards) ? catalogue.cards.map(record) : [];
  const envelopeAssets = Array.isArray(content.assets) ? content.assets.map(record) : [];
  const names = new Map(units.flatMap((unit) => typeof unit.id === "string" && typeof unit.name === "string" ? [[unit.id, unit.name] as const] : []));
  const standaloneAssetViews = assets.flatMap((asset) => {
    const envelope = envelopeAssets.find((candidate) => candidate.ref === asset.blobKey);
    return typeof envelope?.id === "string" ? [{ ...asset, id: envelope.id }] : [];
  });
  const standaloneCards = groupStandaloneCardAssets(cards, standaloneAssetViews).filter(({ card }) => !search || JSON.stringify(card).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const byUnit = new Map<string, Array<{ id: string; key: string; kind: string; sourceName: string | null; sourceUrl: string | null }>>();
  for (const unit of units) {
    const unitId = String(unit.id ?? "");
    const unitCardIds = Array.isArray(unit.cardIds) ? unit.cardIds.map(String) : [];
    const directlyAssociatedCards = cardsForUnit(unitId, unitCardIds, cards, []);
    const references = unitImageReferences({
      unitId,
      unitAssetIds: Array.isArray(unit.assetIds) ? unit.assetIds.filter((value): value is string => typeof value === "string") : [],
      cardAssetIds: directlyAssociatedCards.map((card) => Array.isArray(card.assetIds) ? card.assetIds.filter((value): value is string => typeof value === "string") : []),
      envelopeAssets: envelopeAssets.flatMap((asset) => typeof asset.id === "string" && typeof asset.ref === "string" ? [{ id: asset.id, ref: asset.ref, kind: typeof asset.kind === "string" ? asset.kind : undefined }] : []),
      storedAssets: assets,
    }).filter((asset) => isBlobKey(asset.key));
    if (unitId) byUnit.set(unitId, references);
  }
  const allEntries = [...byUnit.entries()];
  const filteredEntries = search ? allEntries.filter(([unitId, unitAssets]) => {
    const unit = units.find((item) => item.id === unitId) ?? {};
    const related = cardsForUnit(unitId, Array.isArray(unit.cardIds) ? unit.cardIds.map(String) : [], cards, unitAssets);
    return JSON.stringify([unit, related, unitAssets]).toLocaleLowerCase().includes(search.toLocaleLowerCase());
  }) : allEntries;
  const entries = filteredEntries.slice(0, limit);
  return <>
    <SceneBackdrop area="data" />
    <a href="/data" className="w-btn btn">{t("data.title")}</a>
    <h1 className="w-display page-title">{t("data.cards.title")}</h1>
    <p>{pack.gameId.toUpperCase()} · {pack.source} · {pack.sourceDate}</p>
    <form method="get" className="data-form data-card-search">
      <label className="field-label" htmlFor="card-search">{t("data.cards.search")}</label>
      <input id="card-search" type="search" name="q" maxLength={120} defaultValue={search} />
      <button className="btn" type="submit">{t("data.cards.searchButton")}</button>
    </form>
    <p className="hint">{t("data.cards.showing", { shown: entries.length, total: filteredEntries.length })}</p>
    {!assets.length && <div className="w-card card-pad">{t("data.cards.noPrivateImages")}</div>}
    {standaloneCards.length > 0 && <section className="data-card-comparisons">
      <h2 className="w-display">{t("data.cards.standalone")}</h2>
      <p>{t("data.cards.standaloneHelp")}</p>
      {standaloneCards.map(({ card, assets: cardAssets }) => {
        const fields = presentExtractedCardFields(card);
        return <article className="w-card card-pad data-comparison" key={String(card.id)}>
          <header><h3 className="w-display">{typeof card.name === "string" ? card.name : String(card.id)}</h3></header>
          <div className="data-comparison-grid">
            <div className="data-card-images">
              {cardAssets.map((asset) => <figure key={asset.id}>
                <a href={`/data/assets/${pack.id}/${encodeURIComponent(asset.id)}`} target="_blank" rel="noreferrer" title={t("data.cards.openOriginal")} aria-label={`${t("data.cards.openOriginal")} · ${String(card.name ?? card.id)}`}>
                  <Image src={`/data/assets/${pack.id}/${encodeURIComponent(asset.id)}`} alt={`${t("data.pack.asset")} · ${String(card.name ?? card.id)}`} width={600} height={840} unoptimized />
                </a>
                <figcaption>{asset.kind} · {asset.sourceName ?? asset.sourceUrl}</figcaption>
              </figure>)}
            </div>
            <div className="data-card-fields">
              <h4>{t("data.cards.source")}</h4>
              {typeof card.sourceUrl === "string" && <a href={card.sourceUrl} target="_blank" rel="noreferrer">{t("data.cards.source")}</a>}
              {fields.length > 0 ? <dl>{fields.map(({ key, value }) => <div key={key}><dt>{fieldLabel(t, key)}</dt><dd>{value}</dd></div>)}</dl> : <p>{t("data.cards.source")}</p>}
            </div>
          </div>
        </article>;
      })}
    </section>}
    <div className="data-card-comparisons">
      {entries.map(([unitId, unitAssets]) => {
        const unit = units.find((item) => item.id === unitId);
        const relatedCards = cardsForUnit(unitId, Array.isArray(unit?.cardIds) ? unit.cardIds.map(String) : [], cards, unitAssets);
        const cardSources = relatedCards.flatMap((card) => typeof card.productUrl === "string" ? [{ name: typeof card.name === "string" ? card.name : "", url: card.productUrl }] : []);
        const profile = presentUnitProfile(unit ?? {}, Array.isArray(content.provenance) ? content.provenance : [], cardSources);
        return <section className="w-card card-pad data-comparison" key={unitId}>
          <header><h2 className="w-display">{names.get(unitId) ?? unitId}</h2></header>
          <div className="data-comparison-grid">
            <div className="data-card-images">
              {unitAssets.length ? unitAssets.map((asset) => <figure key={asset.id}>
                <a href={`/data/assets/${pack.id}/${encodeURIComponent(asset.id)}`} target="_blank" rel="noreferrer" title={t("data.cards.openOriginal")} aria-label={`${t("data.cards.openOriginal")} · ${names.get(unitId) ?? unitId} · ${asset.kind}`}>
                  <Image src={`/data/assets/${pack.id}/${encodeURIComponent(asset.id)}`} alt={`${t("data.pack.asset")} · ${names.get(unitId) ?? unitId} · ${asset.kind}`} width={600} height={840} unoptimized />
                </a>
                <figcaption>{asset.kind} · {asset.sourceName ?? asset.sourceUrl}</figcaption>
              </figure>) : <p className="hint">{t("data.cards.unitImageUnavailable")}</p>}
            </div>
            <section className="data-card-fields data-profile-summary">
              <h3>{t("data.cards.profileTitle")}</h3>
              {profile.role && <p className="data-profile-role">{fieldLabel(t, "role")}: {profile.role}</p>}
              <dl>{profile.costs.map(({ key, value }) => <div key={key}><dt>{fieldLabel(t, key)}</dt><dd>{value}</dd></div>)}</dl>
              <h4>{t("data.cards.stats")}</h4>
              {profile.stats.length ? <dl>{profile.stats.map(({ key, value }) => <div key={key}><dt>{fieldLabel(t, key)}</dt><dd>{value}</dd></div>)}</dl> : <p className="hint">{t("data.cards.unconfigured")}: {t("data.cards.stats")}</p>}
              {!!profile.keywords.length && <div className="data-profile-keywords"><h4>{t("data.cards.keywords")}</h4><p>{profile.keywords.join(" · ")}</p></div>}
              {!!profile.unconfigured.filter((key) => key !== "stats").length && <p className="data-profile-unconfigured">{t("data.cards.unconfigured")}: {profile.unconfigured.filter((key) => key !== "stats").map((key) => fieldLabel(t, key)).join(", ")}</p>}
              {!!profile.sources.length && <details><summary>{t("data.cards.sources", { count: profile.sources.length })}</summary><ul>{profile.sources.map((source) => <li key={source.url}>{source.name && <strong>{source.name}: </strong>}<a href={source.url} target="_blank" rel="noreferrer">{source.url}</a></li>)}</ul></details>}
            </section>
          </div>
          {relatedCards.length > 0 && <section className="data-card-fields data-extracted-card-text"><h3>{t("data.cards.cardText")}</h3>{relatedCards.map((card) => <article key={String(card.id)}><h4>{typeof card.name === "string" ? card.name : t("data.cards.card")}</h4><details><summary>{t("data.cards.readExtracted")}</summary><dl>{presentExtractedCardFields(card).map(({ key, value }) => <div key={key}><dt>{fieldLabel(t, key)}</dt><dd>{value}</dd></div>)}</dl></details><details><summary>{t("data.cards.technicalJson")}</summary><pre>{JSON.stringify(card, null, 2)}</pre></details></article>)}</section>}
          <details className="data-profile-debug"><summary>{t("data.cards.technicalJson")}</summary><pre>{JSON.stringify(unit ?? {}, null, 2)}</pre></details>
        </section>;
      })}
    </div>
    {filteredEntries.length > limit && <p className="hint"><Link className="btn" href={`/data/cards/${id}?${new URLSearchParams({ ...(search ? { q: search } : {}), limit: String(limit + 60) }).toString()}`}>{t("data.cards.showMore", { count: Math.min(60, filteredEntries.length - limit) })}</Link></p>}
  </>;
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

const profileLabelKeys: Record<string, StringKey> = {
  name: "data.cardProfile.name", role: "data.cardProfile.role", rank: "data.cardProfile.rank", type: "data.cardProfile.type", class: "data.cardProfile.class",
  cost: "data.cardProfile.cost", points: "data.cardProfile.points", threat: "data.cardProfile.threat", squadPoints: "data.cardProfile.squadPoints", rep: "data.cardProfile.rep", reputation: "data.cardProfile.reputation", funding: "data.cardProfile.funding",
  move: "data.cardProfile.move", speed: "data.cardProfile.speed", health: "data.cardProfile.health", wounds: "data.cardProfile.wounds", stamina: "data.cardProfile.stamina", force: "data.cardProfile.force", durability: "data.cardProfile.durability", guard: "data.cardProfile.guard", defence: "data.cardProfile.defence", defense: "data.cardProfile.defence", courage: "data.cardProfile.courage", strength: "data.cardProfile.strength", agility: "data.cardProfile.agility", endurance: "data.cardProfile.endurance", keywords: "data.cardProfile.keywords", stats: "data.cardProfile.stats",
};
function fieldLabel(t: (key: StringKey) => string, field: string): string { const key = profileLabelKeys[field]; return key ? t(key) : humanize(field); }
