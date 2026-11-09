"use client";

import { useActionState, useMemo, useState } from "react";
import Image from "next/image";
import { saveCandidateReview, stageImport, publishReviewedRun, linkCollectionUnit, saveCatalogueOverride, reviewCandidatesBatch } from "./actions";

type Result = { ok: true; message: string } | { ok: false; error: string };
type Strings = Record<string, string>;
type Candidate = { id: number; entityKind: string; sourceId: string; proposed: Record<string, unknown>; matchTargetId: string | null; matchConfidence: string | null; reviewerNote: string | null; reviewState: string };
type UnitOption = { id: string; name: string };
type ReviewRunData = { id: number; gameId: string; status: string; sourceKind: string; sourceUrl: string | null; sourceRevision: string | null; createdAt: string; candidates: Candidate[] };

export function DataWorkbench({ t, runs, packs, rows, overrides, games }: {
  t: Strings;
  runs: ReviewRunData[];
  packs: Array<{ id: number; gameId: string; label: string; source: string; sourceDate: string; units: UnitOption[]; assetCount: number }>;
  rows: Array<{ id: number; gameId: string; unitName: string; unitId: string | null; suggestions: Array<{ id: string; name: string; confidence: number; exact: boolean }> }>;
  overrides: Array<{ gameId: string; targetId: string; field: string; reason: string | null }>;
  games: Array<{ id: string; name: string }>;
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState(async (_: Result | null, formData: FormData) => stageImport(formData), null);
  const [overrideState, overrideAction, overridePending] = useActionState(async (_: Result | null, formData: FormData) => saveCatalogueOverride(formData), null);
  return <div className="data-workbench">
    <section className="w-card card-pad data-panel">
      <h2 className="w-display">{t["data.upload.title"]}</h2>
      <p>{t["data.upload.help"]}</p>
      <form action={uploadAction} className="data-form">
        <label>{t["data.upload.file"]}<input type="file" name="bundle" accept="application/json,.json" required /></label>
        <button className="w-btn btn" disabled={uploadPending}>{uploadPending ? t["data.actions.upload"] : t["data.actions.upload"]}</button>
        {uploadState && <p role="status">{uploadState.ok ? uploadState.message.startsWith("staged:") ? (t["data.upload.success"] ?? "").replace("{run}", uploadState.message.split(":")[1] ?? "").replace("{count}", uploadState.message.split(":")[2] ?? "") : t["data.feedback.saved"] : uploadState.error === "too-large" ? (t["data.upload.tooLarge"] ?? "").replace("{limit}", "3") : t["data.upload.invalid"]}</p>}
      </form>
    </section>

    <section className="data-section">
      <h2 className="w-display">{t["data.runs.title"]}</h2>
      {!runs.length && <div className="w-card card-pad">{t["data.runs.empty"]}</div>}
      {runs.map((run) => <ReviewRun key={run.id} t={t} run={run} packs={packs} />)}
    </section>

    <section className="data-section">
      <h2 className="w-display">{t["data.pack.title"]}</h2>
      {!packs.length && <div className="w-card card-pad">{t["data.pack.empty"]}</div>}
      <div className="grid-cards">{packs.map((pack) => <article className="w-card card-pad" key={pack.id}>
        <h3 className="w-display">{pack.gameId.toUpperCase()} · {pack.label}</h3>
        <p>{t["data.units"]}: {pack.units.length}</p>
        <p>{(t["data.pack.source"] ?? "").replace("{source}", pack.source)} · {pack.sourceDate}</p>
        <p>{t["data.pack.assets"]}: {pack.assetCount}</p>
        <a className="w-btn btn" href={`/data/cards/${pack.id}`}>{t["data.pack.viewCards"]}</a>
      </article>)}</div>
    </section>

    <section className="w-card card-pad data-panel">
      <h2 className="w-display">{t["data.collection.title"]}</h2>
      <p>{t["data.collection.help"]}</p>
      {!rows.length && <p>{t["data.collection.none"]}</p>}
      {rows.map((row) => {
        const options = packs.filter((pack) => pack.gameId === row.gameId).flatMap((pack) => pack.units);
        return <CollectionLink key={row.id} t={t} row={row} options={options} suggestions={row.suggestions} />;
      })}
    </section>

    <section className="w-card card-pad data-panel">
      <h2 className="w-display">{t["data.override.title"]}</h2>
      <p>{t["data.override.help"]}</p>
      <form action={overrideAction} className="data-form data-override-form">
        <label>{t["data.override.game"]}<select name="gameId">{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label>
        <label>{t["data.override.target"]}<input name="targetId" required /></label>
        <label>{t["data.override.field"]}<input name="field" placeholder="points" required /></label>
        <label>{t["data.override.value"]}<textarea name="value" defaultValue="null" required /></label>
        <label>{t["data.override.reason"]}<input name="reason" /></label>
        <button className="w-btn btn" disabled={overridePending}>{t["data.actions.override"]}</button>
        {overrideState && <p role="status">{overrideState.ok ? t["data.override.saved"] : t["data.override.failed"]}</p>}
      </form>
      {overrides.length === 0 ? <p>{t["data.override.empty"]}</p> : <ul>{overrides.map((override) => <li key={`${override.gameId}:${override.targetId}:${override.field}`}>{override.gameId} · <code>{override.targetId}</code> · <code>{override.field}</code>{override.reason ? ` — ${override.reason}` : ""}</li>)}</ul>}
    </section>
  </div>;
}

function ReviewRun({ t, run, packs }: { t: Strings; run: ReviewRunData; packs: Array<{ gameId: string; units: UnitOption[] }> }) {
  const candidates = run.candidates;
  const candidateUnits = candidates.filter((candidate) => candidate.entityKind === "unit").map((candidate) => ({ id: String(candidate.proposed.id), name: String(candidate.proposed.name) }));
  const units = [...new Map([...packs.filter((pack) => pack.gameId === run.gameId).flatMap((pack) => pack.units), ...candidateUnits].map((unit) => [unit.id, unit])).values()];
  const counts = { pending: candidates.filter((candidate) => candidate.reviewState === "pending").length, accepted: candidates.filter((candidate) => candidate.reviewState === "accepted").length, rejected: candidates.filter((candidate) => candidate.reviewState === "rejected").length };
  const [kind, setKind] = useState("all"); const [status, setStatus] = useState("pending"); const [search, setSearch] = useState(""); const [selected, setSelected] = useState<number[]>([]);
  const filtered = useMemo(() => candidates.filter((candidate) => (kind === "all" || candidate.entityKind === kind) && (status === "all" || candidate.reviewState === status) && `${candidate.proposed.name ?? ""} ${candidate.sourceId}`.toLowerCase().includes(search.toLowerCase())), [candidates, kind, status, search]);
  const batchId = `review-batch-${run.id}`;
  const [batchState, batchAction, batchPending] = useActionState(async (_: Result | null, formData: FormData) => reviewCandidatesBatch(formData), null);
  return <article className="w-card card-pad data-run">
    <header><h3 className="w-display">{runTitle(run)}</h3><span className="label">{run.sourceKind === "official-product-image-candidates" && run.status === "accepted" ? t["data.run.status.reviewed"] : t[`data.run.status.${run.status}`] ?? run.status}</span></header>
    <p>{t["data.run.source"]}: {run.sourceUrl ?? "—"}</p>
    <p>{t["data.run.revision"]}: <code>{run.sourceRevision ?? "—"}</code> · {t["data.run.created"]}: {run.createdAt}</p>
    <div className="data-counts"><span>{(t["data.run.pending"] ?? "").replace("{count}", String(counts.pending))}</span><span>{(t["data.run.accepted"] ?? "").replace("{count}", String(counts.accepted))}</span><span>{(t["data.run.rejected"] ?? "").replace("{count}", String(counts.rejected))}</span></div>
    {(run.status === "review" || run.sourceKind === "official-product-image-candidates") && <>
      <h4>{t["data.candidates.title"]}</h4>
      {!candidates.length && <p>{t["data.candidates.empty"]}</p>}
      {run.status === "review" && <div className="data-form data-review-filters">
        <label>{t["data.review.filter.type"]}<select value={kind} onChange={(event) => { setKind(event.target.value); setSelected([]); }}><option value="all">{t["data.review.filter.allTypes"]}</option>{[...new Set(candidates.map((candidate) => candidate.entityKind))].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>{t["data.review.filter.status"]}<select value={status} onChange={(event) => { setStatus(event.target.value); setSelected([]); }}><option value="pending">{t["data.review.filter.pending"]}</option><option value="accepted">{t["data.review.filter.accepted"]}</option><option value="rejected">{t["data.review.filter.rejected"]}</option><option value="all">{t["data.review.filter.all"]}</option></select></label>
        <label>{t["data.review.filter.search"]}<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <button type="button" className="w-btn btn" onClick={() => setSelected(filtered.map((candidate) => candidate.id))}>{t["data.review.batch.selectVisible"]}</button>
        <button type="button" className="w-btn btn" onClick={() => setSelected([])}>{t["data.review.batch.clear"]}</button>
        <form id={batchId} action={batchAction} className="data-form"><input type="hidden" name="runId" value={run.id} /><input type="hidden" name="candidateIds" value={JSON.stringify(selected)} /><label>{t["data.review.batch.label"]}<select name="reviewState"><option value="accepted">{t["data.review.batch.accept"]}</option><option value="rejected">{t["data.review.batch.reject"]}</option></select></label><button className="w-btn btn" disabled={batchPending || selected.length === 0}>{(t["data.review.batch.apply"] ?? "").replace("{count}", String(selected.length))}</button>{batchState && <span role="status">{batchState.ok ? t["data.feedback.saved"] : batchState.error === "individual-match-required" ? t["data.review.batch.needsIndividual"] : t["data.feedback.invalid"]}</span>}</form>
      </div>}
      {filtered.map((candidate) => <div key={candidate.id}><label className="data-batch-select"><input type="checkbox" form={batchId} checked={selected.includes(candidate.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))} /> {t["data.review.select"]}</label><ReviewRow t={t} candidate={candidate} units={units} /></div>)}
      {run.sourceKind !== "official-product-image-candidates" && <PublishForm t={t} runId={run.id} disabled={counts.pending > 0 || counts.accepted === 0} />}
    </>}
  </article>;
}

function ReviewRow({ t, candidate, units }: { t: Strings; candidate: Candidate; units: UnitOption[] }) {
  const [opened, setOpened] = useState(false);
  const [state, action, pending] = useActionState(async (_: Result | null, formData: FormData) => saveCandidateReview(formData), null);
  const name = typeof candidate.proposed.name === "string" ? candidate.proposed.name : typeof candidate.proposed.productName === "string" ? candidate.proposed.productName : candidate.sourceId;
  const needsUnit = candidate.entityKind === "image" || candidate.entityKind === "points" || candidate.entityKind === "asset" || (["card", "token"].includes(candidate.entityKind) && Array.isArray(candidate.proposed.assetIds) && candidate.proposed.assetIds.length > 0);
  const standaloneCardTarget = candidate.entityKind === "card" && Array.isArray(candidate.proposed.assetIds) && candidate.proposed.assetIds.length > 0 && typeof candidate.proposed.id === "string" ? `card:${candidate.proposed.id}` : null;
  const imageUrl = candidate.reviewState === "accepted" && candidate.entityKind === "image" && typeof candidate.proposed.imageUrl === "string" && safeImageUrl(candidate.proposed.imageUrl) ? candidate.proposed.imageUrl : undefined;
  return <details className="data-candidate" onToggle={(event) => { if (event.currentTarget.open) setOpened(true); }}>
    <summary><span>{name}</span><span className="label">{candidate.entityKind} · {candidate.reviewState}</span></summary>
    {opened && <form action={action} className="data-form">
      <input type="hidden" name="candidateId" value={candidate.id} />
      <label>{t["data.candidate.proposed"]}<textarea name="proposed" defaultValue={JSON.stringify(candidate.proposed, null, 2)} rows={8} spellCheck={false} /></label>
      {needsUnit ? <label>{t[candidate.entityKind === "card" ? "data.candidate.cardAssociation" : "data.candidate.selectUnit"]}<select name="matchTargetId" defaultValue={candidate.matchTargetId ?? ""} required><option value="">{t["data.collection.choose"]}</option>{standaloneCardTarget && <option value={standaloneCardTarget}>{t["data.candidate.standaloneCard"]}</option>}{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {unit.id}</option>)}</select></label> : <label>{t["data.candidate.match"]}<input name="matchTargetId" defaultValue={candidate.matchTargetId ?? ""} /></label>}
      <label>{t["data.candidate.confidence"]}<input name="matchConfidence" type="number" min="0" max="1" step="0.001" defaultValue={candidate.matchConfidence ?? ""} /></label>
      <label>{t["data.candidate.note"]}<input name="reviewerNote" defaultValue={candidate.reviewerNote ?? ""} /></label>
      <label>{t["data.candidate.state"]}<select name="reviewState" defaultValue={candidate.reviewState}><option value="pending">{t["data.candidate.pending"]}</option><option value="accepted">{t["data.candidate.accept"]}</option><option value="rejected">{t["data.candidate.reject"]}</option></select></label>
      <button className="w-btn btn" disabled={pending}>{t["data.actions.save"]}</button>
      {state && <span role="status">{state.ok ? t["data.feedback.saved"] : state.error === "asset-unmatched" ? candidate.entityKind === "points" ? t["data.candidate.targetRequired"] : t["data.feedback.assetUnmatched"] : t["data.feedback.invalid"]}</span>}
    </form>}
    {opened && imageUrl && <figure className="data-external-image"><Image src={imageUrl} alt={name} width={600} height={840} unoptimized /><figcaption>{t["data.externalImage"]} · <a href={String(candidate.proposed.productUrl)} target="_blank" rel="noreferrer">{t["data.run.source"]}</a></figcaption></figure>}
  </details>;
}

function CollectionLink({ t, row, options, suggestions }: { t: Strings; row: { id: number; gameId: string; unitName: string; unitId: string | null }; options: UnitOption[]; suggestions: Array<{ id: string; name: string; confidence: number; exact: boolean }> }) {
  const [state, action, pending] = useActionState(async (_: Result | null, formData: FormData) => linkCollectionUnit(formData), null);
  return <form action={action} className="data-match-row">
    <input type="hidden" name="itemId" value={row.id} />
    <strong>{row.unitName}</strong><span className="label">{row.gameId} · {row.unitId ?? t["data.collection.unmatched"]}</span>
    <select name="unitId" defaultValue={row.unitId ?? ""} required><option value="">{t["data.collection.choose"]}</option>{suggestions.length > 0 && <optgroup label={t["data.collection.help"]}>{suggestions.map((option) => <option value={option.id} key={`suggested:${option.id}`}>{option.name} · {option.exact ? t["data.collection.exactSuggestion"] : (t["data.collection.fuzzySuggestion"] ?? "").replace("{confidence}", `${Math.round(option.confidence * 100)}%`)}</option>)}</optgroup>}{options.map((option) => <option value={option.id} key={`all:${option.id}`}>{option.name} · {option.id}</option>)}</select>
    <button className="w-btn btn" disabled={!options.length || pending}>{t["data.collection.link"]}</button>
    {state && <span role="status">{state.ok ? t["data.collection.linked"] : t["data.collection.failed"]}</span>}
  </form>;
}

function PublishForm({ t, runId, disabled }: { t: Strings; runId: number; disabled: boolean }) {
  const [state, action, pending] = useActionState(async (_: Result | null, formData: FormData) => publishReviewedRun(formData), null);
  return <form action={action} className="data-form">
    <input type="hidden" name="runId" value={runId} />
    <p>{t["data.run.publishHelp"]}</p>
    <button className="w-btn btn" disabled={disabled || pending}>{t["data.actions.publish"]}</button>
    {state && <p role="status">{state.ok ? (t["data.run.publishSuccess"] ?? "").replace("{pack}", state.message.split(":")[1] ?? "") : state.error === "pending" ? t["data.feedback.pending"] : state.error === "no-records" ? t["data.feedback.noUnits"] : state.error === "asset-unmatched" ? t["data.feedback.assetUnmatched"] : state.error === "asset-missing-private-blob" ? t["data.feedback.assetMissing"] : t["data.feedback.invalid"]}</p>}
  </form>;
}

function safeImageUrl(value: string) {
  try {
    const url = new URL(value);
    const allowed = ["warhammer.com", "warhammer-community.com", "atomicmassgames.com", "knightmodels.com", "cdn.svc.asmodee.net", "cdn.shopify.com"];
    return url.protocol === "https:" && !url.username && !url.password && allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

/** Five staged imports of one game read alike; the factions the run brings (letters only, so "❖ Lores" stays out) tell them apart. */
function runTitle(run: ReviewRunData): string {
  const factions = [...new Set(run.candidates.filter((c) => c.entityKind === "faction").map((c) => String(c.proposed.name ?? "")).filter((name) => /^\p{L}/u.test(name)))];
  return `${run.gameId.toUpperCase()} · ${factions.length ? factions.join(", ") : run.sourceKind}`;
}
