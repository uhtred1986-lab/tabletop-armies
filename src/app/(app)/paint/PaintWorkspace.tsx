"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { formatNumber, type Locale } from "@/i18n";
import { collectionT } from "@/i18n/features/collection";
import { calculatePaintProgress } from "@/collection/domain";
import { savePaintStageSetup, updateModelPaintStage } from "../collection/actions";
import styles from "./paint.module.css";

export type PaintModelView = {
  id: number;
  modelKey: string;
  itemId: number;
  name: string;
  faction: string | null;
  ordinal: number;
  label: string | null;
  stageId: number;
  stageKey: string;
  stageLabel: string;
  stageOrder: number;
  photos: { id: number }[];
};
export type PaintHistoryView = {
  id: number;
  modelKey: string;
  unitName: string;
  modelOrdinal: number;
  modelLabel: string | null;
  fromStageLabel: string | null;
  toStageLabel: string;
  fromCompleted: boolean;
  toCompleted: boolean;
  changedAt: Date;
};
type Stage = { id: number; key: string; label: string; sortOrder: number };

export function PaintWorkspace({ locale, stages, models, history, failed }: {
  locale: Locale; stages: Stage[]; models: PaintModelView[]; history: PaintHistoryView[]; failed: boolean;
}) {
  const t = collectionT(locale);
  const router = useRouter();
  const [busy, start] = useTransition();
  const [faction, setFaction] = useState("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [stageChoice, setStageChoice] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(stages);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const editorRef = useRef<HTMLDialogElement>(null);
  const draftDirty = JSON.stringify(draft.map(({ id, key, label, sortOrder }) => ({ id, key, label, sortOrder }))) !==
    JSON.stringify(stages.map(({ id, key, label, sortOrder }) => ({ id, key, label, sortOrder })));
  useEffect(() => {
    const node = editorRef.current;
    if (!editorOpen || !node) return;
    node.showModal();
    return () => { if (node.open) node.close(); };
  }, [editorOpen]);
  const factions = [...new Set(models.map((model) => model.faction).filter((value): value is string => Boolean(value)))].sort();
  const visible = models.filter((model) => faction === "all" || model.faction === faction);
  const progress = calculatePaintProgress(models.map((model) => ({ faction: model.faction, stageId: model.stageId })), stages[stages.length - 1]?.id ?? null);
  const painted = progress.painted;
  const percent = progress.percent;
  const factionSummary = progress.factions.filter((entry) => entry.faction !== null).map((entry) => ({
    name: entry.faction!, total: entry.total, painted: entry.painted, percent: entry.percent,
  }));
  const run = (work: () => Promise<{ ok: boolean }>, message = "") => {
    setError("");
    start(async () => {
      const result = await work();
      if (!result.ok) { setError(t("collection.action.failed")); return; }
      setNotice(message);
      setSelected([]);
      setStageChoice("");
      router.refresh();
    });
  };
  const changeStage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected.length || !stageChoice) return;
    run(() => updateModelPaintStage(selected, Number(stageChoice)), t("paint.changed"));
  };
  const saveSequence = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run(async () => {
      const result = await savePaintStageSetup({ stages: draft.map(({ id, label }) => ({ id, label })) });
      if (result.ok) setEditorOpen(false);
      return result;
    }, t("paint.stageSave"));
  };
  const reorder = (index: number, nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= draft.length) return;
    const copy = [...draft];
    const [stage] = copy.splice(index, 1);
    if (stage) copy.splice(nextIndex, 0, stage);
    setDraft(copy);
  };
  const closeEditor = () => {
    if (draftDirty && !window.confirm(t("collection.dialog.unsaved"))) return;
    setEditorOpen(false);
  };
  const toggleAll = () => setSelected(selected.length === visible.length ? [] : visible.map((model) => model.id));
  if (failed) return <section className="w-card card-pad" role="alert">{t("collection.error")} <button type="button" className="w-btn secondary" onClick={() => router.refresh()}>{t("collection.action.retry")}</button></section>;
  return <div className={styles.workspace}>
    <header className={styles.header}>
      <div><p>{t("paint.description")}</p><div className={styles.total}><strong className="num">{formatNumber(locale, percent)}%</strong><span>{t("paint.progress", { percent: formatNumber(locale, percent) })}</span><span className="num">{formatNumber(locale, models.length)} {t("paint.total")}</span><span className="num">{formatNumber(locale, painted)} {t("paint.done")}</span></div></div>
      <button type="button" className="w-btn secondary" onClick={() => { setDraft(stages); setEditorOpen(true); }}>{t("paint.stageEditor")}</button>
    </header>
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {factionSummary.length ? <section className={styles.factions} aria-label={t("paint.faction")}>{factionSummary.map((entry) => <button type="button" key={entry.name} className={styles.faction} aria-pressed={faction === entry.name} onClick={() => setFaction(faction === entry.name ? "all" : entry.name)}>
        <span>{entry.name}</span><strong className="num">{formatNumber(locale, entry.painted)} / {formatNumber(locale, entry.total)}</strong><span className="num">{formatNumber(locale, entry.percent)}%</span><span className={styles.progress}><i style={{ width: entry.percent + "%" }} /></span>
    </button>)}</section> : null}
    <div className={styles.tools}>
      <label>{t("paint.faction")}<select value={faction} onChange={(event) => setFaction(event.target.value)}><option value="all">{t("collection.filter.faction")}</option>{factions.map((name) => <option key={name}>{name}</option>)}</select></label>
      {visible.length ? <label className={styles.selectAll}><input type="checkbox" checked={visible.length > 0 && selected.length === visible.length} onChange={toggleAll} />{t("paint.select")}</label> : null}
      {selected.length ? <form onSubmit={changeStage} className={styles.bulk}>
        <select aria-label={t("paint.change.all")} required value={stageChoice} onChange={(event) => setStageChoice(event.target.value)}><option value="">{t("paint.change.all")}</option>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}</select>
        <button type="submit" className="w-btn" disabled={busy}>{t("paint.change.all")} · {formatNumber(locale, selected.length)}</button>
      </form> : null}
    </div>
    {!models.length ? <section className="w-card card-pad">{t("paint.empty")}</section> : <section className={styles.board} aria-label={t("paint.title")}>
      {stages.map((stage, index) => {
        const rows = visible.filter((model) => model.stageId === stage.id);
        return <section className={styles.column} key={stage.id}>
          <header><h2>{stage.label}</h2><span className="num">{formatNumber(locale, rows.length)}</span></header>
          {rows.map((model) => <article className={styles.model} key={model.id}>
            <label><input type="checkbox" checked={selected.includes(model.id)} onChange={() => setSelected((current) => current.includes(model.id) ? current.filter((id) => id !== model.id) : [...current, model.id])} /><span>{model.label || t("collection.model", { ordinal: formatNumber(locale, model.ordinal) })}</span></label>
            <strong>{model.name}</strong>
            {model.faction ? <small>{model.faction}</small> : null}
            {model.photos.length ? <Image src={"/api/photos/" + model.photos[0]!.id} alt={model.label || model.name} width={320} height={216} unoptimized loading="lazy" /> : null}
            <div className={styles.modelActions}>
              <select aria-label={t("collection.paint")} value={model.stageId} disabled={busy} onChange={(event) => run(() => updateModelPaintStage([model.id], Number(event.target.value)), t("paint.changed"))}>
                {stages.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
              </select>
              {index < stages.length - 1 ? <button type="button" className="w-btn secondary" disabled={busy} onClick={() => run(() => updateModelPaintStage([model.id], stages[index + 1]!.id), t("paint.changed"))}>{t("paint.next")}</button> : null}
            </div>
          </article>)}
        </section>;
      })}
    </section>}
    <section className={styles.history}>
      <header><h2 className="w-display">{t("paint.history")}</h2></header>
      {!history.length ? <p>{t("paint.history.empty")}</p> : <ol>{history.map((entry) => {
        const date = new Intl.DateTimeFormat(locale === "de" ? "de-AT" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.changedAt));
        return <li key={entry.id}><span>{entry.modelLabel || t("collection.model", { ordinal: formatNumber(locale, entry.modelOrdinal) })}</span><strong>{entry.unitName}</strong><span>{t("paint.history.label", { from: entry.fromStageLabel || "—", to: entry.toStageLabel, date })}</span></li>;
      })}</ol>}
    </section>
    {editorOpen ? <dialog ref={editorRef} aria-modal="true" className={styles.dialog} onCancel={(event) => { event.preventDefault(); closeEditor(); }}>
      <header><h2 className="w-display">{t("paint.stageEditor")}</h2><button type="button" className="w-btn secondary" aria-label={t("collection.dialog.close")} onClick={closeEditor}>×</button></header>
      <p>{t("paint.stageEditorHint")}</p>
      <form id="stage-editor" onSubmit={saveSequence}>
        <ol>{draft.map((stage, index) => <li key={stage.id}>
          <input required maxLength={48} aria-label={stage.label} value={stage.label} onChange={(event) => setDraft((current) => current.map((item) => item.id === stage.id ? { ...item, label: event.target.value } : item))} />
          <button type="button" className="w-btn secondary" aria-label={t("paint.stageMoveUp", { stage: stage.label })} disabled={index === 0} onClick={() => reorder(index, index - 1)}>↑</button>
          <button type="button" className="w-btn secondary" aria-label={t("paint.stageMoveDown", { stage: stage.label })} disabled={index === draft.length - 1} onClick={() => reorder(index, index + 1)}>↓</button>
        </li>)}</ol>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </form>
      <footer><button type="button" className="w-btn secondary" onClick={closeEditor}>{t("collection.action.cancel")}</button><button type="submit" className="w-btn" form="stage-editor" disabled={busy}>{t("paint.stageSave")}</button></footer>
    </dialog> : null}
  </div>;
}
