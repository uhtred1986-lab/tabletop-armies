"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { put } from "@vercel/blob/client";
import { formatNumber, type Locale } from "@/i18n";
import { collectionT, type CollectionT } from "@/i18n/features/collection";
import type { CatalogueProfile, CatalogueReferenceImage } from "@/collection/catalogue";
import type { StarterBox } from "@/collection/starter-boxes";
import { StarterBoxesPanel } from "./StarterBoxesPanel";
import {
  createCollectionUnit, deleteCollectionUnit, deletePhoto, discardPhotoUpload, increaseCollectionModels,
  issuePhotoUpload, moveCollectionUnit, moveSelectedModels, registerPhoto,
  removeSelectedCollectionModels, retryBlobDeletionQueue, undoCollectionMove, updateCollectionUnit, updateModelPaintStage,
} from "./actions";
import styles from "./collection.module.css";

export type PlaceView = { id: number; name: string; kind: string | null };
export type StageView = { id: number; key: string; label: string; sortOrder: number };
export type ModelView = {
  id: number;
  ordinal: number;
  label: string | null;
  placeId: number | null;
  stageId: number;
  stageKey: string;
  stageLabel: string;
  photos: { id: number; caption: string | null }[];
};
export type UnitView = {
  id: number;
  name: string;
  faction: string | null;
  loadout: string | null;
  catalogueUnitId: string | null;
  catalogueName: string | null;
  referenceImages: CatalogueReferenceImage[];
  models: ModelView[];
  photos: { id: number; caption: string | null }[];
};

type Props = {
  locale: Locale;
  units: UnitView[];
  places: PlaceView[];
  stages: StageView[];
  catalogueProfiles: CatalogueProfile[];
  starterBoxes: StarterBox[];
  totalModels: number;
  paintedModels: number;
  loadingError?: boolean;
  initialPlaceFilter?: string;
};
type UndoChange = { modelId: number; fromPlaceId: number | null; toPlaceId: number | null };
type MoveTarget = { kind: "unit"; itemId: number } | { kind: "models"; modelIds: number[] };

function Dialog({ title, closeLabel, discardPrompt, dirty, onClose, children, footer }: { title: string; closeLabel: string; discardPrompt: string; dirty?: boolean; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const requestClose = () => {
    if (dirty && !window.confirm(discardPrompt)) return;
    onClose();
  };
  return (
    <dialog ref={ref} className={styles.dialog} aria-modal="true" aria-label={title} onCancel={(event) => { event.preventDefault(); requestClose(); }}>
      <div className={styles.dialogHeader}>
        <h2 className="w-display">{title}</h2>
        <button type="button" className="w-btn secondary" aria-label={closeLabel} onClick={requestClose}>×</button>
      </div>
      <div className={styles.dialogBody}>{children}</div>
      <div className={styles.dialogFooter}>{footer}</div>
    </dialog>
  );
}

function PhotoTile({ id, caption, alt, t, onDelete }: { id: number; caption: string | null; alt: string; t: CollectionT; onDelete: (id: number) => void }) {
  return (
    <figure className={styles.photo}>
      {/* Private route verifies the owner and photo record on every byte request. */}
      <Image src={"/api/photos/" + id} alt={caption || alt} width={300} height={220} unoptimized loading="lazy" />
      {caption ? <figcaption>{caption}</figcaption> : null}
      <button type="button" className="w-btn secondary" onClick={() => onDelete(id)}>{t("collection.photo.delete")}</button>
    </figure>
  );
}

function ReferenceTile({ asset, alt, t }: { asset: CatalogueReferenceImage; alt: string; t: CollectionT }) {
  let safeSource: string | null = null;
  try {
    const url = new URL(asset.sourceUrl);
    if (url.protocol === "https:" || url.protocol === "http:") safeSource = url.toString();
  } catch { /* Imported metadata may omit a source URL. */ }
  return <figure className={styles.photo}>
    <Image src={asset.imageUrl || "/api/catalogue-assets/" + asset.id} alt={asset.alt || alt} width={300} height={220} unoptimized loading="lazy" />
    <figcaption>{t("collection.reference.label")}{asset.sourceName ? ": " + asset.sourceName : ""}</figcaption>
    {safeSource ? <a href={safeSource} target="_blank" rel="noreferrer">{t("collection.reference.source")}</a> : null}
  </figure>;
}

function PhotoUpload({ itemId, modelId, alt, t, onUploaded }: { itemId?: number; modelId?: number; alt: string; t: CollectionT; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<{ pathname: string; caption: string } | null>(null);
  const [caption, setCaption] = useState("");
  const targetKey = modelId !== undefined ? "model-" + modelId : "item-" + itemId;

  const uploadFile = async (file: File) => {
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError(t("collection.photo.invalid"));
      return;
    }
    setBusy(true);
    let pathname = "";
    let uploaded = false;
    try {
      const token = await issuePhotoUpload({ itemId, modelId, contentType: file.type });
      if (!token.ok) throw new Error("token");
      pathname = token.pathname;
      await put(token.pathname, file, { token: token.token, access: "private", contentType: file.type, multipart: false });
      uploaded = true;
      setRetry({ pathname, caption });
      const result = await registerPhoto({ pathname: token.pathname, itemId, modelId, caption });
      if (!result.ok) {
        setRetry({ pathname: token.pathname, caption });
        setError(t("collection.photo.failed"));
      } else {
        setCaption("");
        setRetry(null);
        onUploaded();
      }
    } catch {
      if (pathname && !uploaded) {
        try { await discardPhotoUpload(pathname); } catch { /* Retry is unnecessary if the upload did not finish. */ }
      } else if (pathname) {
        setRetry({ pathname, caption });
      }
      setError(t("collection.photo.failed"));
    } finally {
      setBusy(false);
    }
  };
  const retryRegistration = async () => {
    if (!retry) return;
    setBusy(true);
    setError("");
    try {
      const result = await registerPhoto({ pathname: retry.pathname, itemId, modelId, caption: retry.caption });
      if (result.ok) {
        setRetry(null);
        onUploaded();
      } else setError(t("collection.photo.failed"));
    } catch {
      setError(t("collection.photo.failed"));
    } finally {
      setBusy(false);
    }
  };
  const discardRetry = async () => {
    if (!retry) return;
    setBusy(true);
    setError("");
    try {
      const result = await discardPhotoUpload(retry.pathname);
      if (!result.ok) { setError(t("collection.photo.failed")); return; }
      setRetry(null);
      setCaption("");
    } catch {
      setError(t("collection.photo.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.photoUpload}>
      <div className={styles.captionField}>
        <label className="label" htmlFor={"caption-" + targetKey}>{t("collection.photo.caption")}</label>
        <input id={"caption-" + targetKey} value={caption} maxLength={180} onChange={(event) => setCaption(event.target.value)} placeholder={t("collection.photo.caption")} />
      </div>
      <label className="w-btn secondary">
        {busy ? t("collection.photo.uploading") : t("collection.photo.add")}
        <input
          id={"photo-" + targetKey}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          className={styles.fileInput}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void uploadFile(file);
          }}
        />
      </label>
      {retry ? <button type="button" className="w-btn secondary" disabled={busy} onClick={() => void retryRegistration()}>{t("collection.action.retry")}</button> : null}
      {retry ? <button type="button" className="w-btn secondary" disabled={busy} onClick={() => void discardRetry()}>{t("collection.photo.discard")}</button> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <span className={styles.visuallyHidden}>{alt}</span>
    </div>
  );
}

export function CollectionWorkspace({ locale, units, places, stages, catalogueProfiles, starterBoxes, totalModels, paintedModels, loadingError, initialPlaceFilter = "all" }: Props) {
  const t = collectionT(locale);
  const router = useRouter();
  const [busy, start] = useTransition();
  const [search, setSearch] = useState("");
  const [placeFilter, setPlaceFilter] = useState(initialPlaceFilter);
  const [stageFilter, setStageFilter] = useState("all");
  const [factionFilter, setFactionFilter] = useState("all");
  const [expanded, setExpanded] = useState<number[]>([]);
  const [selectedModels, setSelectedModels] = useState<number[]>([]);
  const [dialog, setDialog] = useState<"add" | "edit" | "delete" | "deletePhoto" | "deleteModels" | null>(null);
  const [activeUnit, setActiveUnit] = useState<UnitView | null>(null);
  const [deletePhotoId, setDeletePhotoId] = useState<number | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [movePlaceId, setMovePlaceId] = useState("");
  const [undo, setUndo] = useState<UndoChange[] | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [formDirty, setFormDirty] = useState(false);
  const [form, setForm] = useState({ name: "", faction: "", loadout: "", models: "1", catalogueUnitId: "" });
  const [countTarget, setCountTarget] = useState("1");

  useEffect(() => { void retryBlobDeletionQueue(); }, []);

  const factions = [...new Set(units.map((unit) => unit.faction).filter((value): value is string => Boolean(value)))].sort();
  const visibleUnits = units.map((unit) => {
    const nameMatches = !search || (unit.name + " " + (unit.faction || "")).toLocaleLowerCase().includes(search.toLocaleLowerCase());
    const factionMatches = factionFilter === "all" || unit.faction === factionFilter;
    const visibleModels = unit.models.filter((model) => {
      const placeMatches = placeFilter === "all" || (placeFilter === "none" ? model.placeId === null : model.placeId === Number(placeFilter));
      const stageMatches = stageFilter === "all" || model.stageKey === stageFilter;
      return placeMatches && stageMatches;
    });
    return { unit, visibleModels, visible: nameMatches && factionMatches && visibleModels.length > 0 };
  }).filter((entry) => entry.visible);
  const pct = totalModels ? Math.floor((paintedModels * 100) / totalModels) : 0;

  const runAction = (work: () => Promise<{ ok: boolean; error?: string; undo?: UndoChange[] }>, success?: string) => {
    setActionError("");
    start(async () => {
      const result = await work();
      if (!result.ok) {
        setActionError(t(result.error === "move-stale" ? "collection.move.stale" : "collection.action.failed"));
        return;
      }
      if (result.undo) setUndo(result.undo);
      if (success) setNotice(success);
      setDialog(null);
      setSelectedModels([]);
      router.refresh();
    });
  };

  const submitUnit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog === "edit" && activeUnit) {
      runAction(() => updateCollectionUnit({ id: activeUnit.id, name: form.name, faction: form.faction, loadout: form.loadout, unitId: form.catalogueUnitId || null }));
      return;
    }
    runAction(() => createCollectionUnit({ ...form, unitId: form.catalogueUnitId || null, models: Number(form.models) }));
  };
  const openEdit = (unit: UnitView) => {
    setActiveUnit(unit);
    setForm({ name: unit.name, faction: unit.faction || "", loadout: unit.loadout || "", models: String(unit.models.length), catalogueUnitId: unit.catalogueUnitId || "" });
    setFormDirty(false);
    setDialog("edit");
  };
  const openAddUnit = () => { setActionError(""); setFormDirty(false); setForm({ name: "", faction: "", loadout: "", models: "1", catalogueUnitId: "" }); setDialog("add"); };
  const setUnitCount = (unit: UnitView) => {
    const target = Number(countTarget);
    if (!Number.isInteger(target) || target < unit.models.length) {
      setActionError(t("collection.unit.reduceHint"));
      return;
    }
    setCountTarget(String(target));
    runAction(() => increaseCollectionModels(unit.id, target));
  };
  const toggleExpanded = (id: number) => {
    const unit = units.find((entry) => entry.id === id);
    if (unit) setCountTarget(String(unit.models.length));
    setExpanded((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };
  const toggleModel = (id: number) => setSelectedModels((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const openMove = (target: MoveTarget) => { setMoveTarget(target); setMovePlaceId(""); };
  const submitMove = () => {
    if (!moveTarget) return;
    const placeId = movePlaceId ? Number(movePlaceId) : null;
    if (placeId !== null && !places.some((place) => place.id === placeId)) return;
    runAction(
      () => moveTarget.kind === "unit" ? moveCollectionUnit(moveTarget.itemId, placeId) : moveSelectedModels(moveTarget.modelIds, placeId),
      t("collection.move.undone"),
    );
    setMoveTarget(null);
  };
  if (loadingError) return <section className="w-card card-pad" role="alert">{t("collection.error")} <button type="button" className="w-btn secondary" onClick={() => router.refresh()}>{t("collection.action.retry")}</button></section>;

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p className="label">{t("collection.summary.units")}</p>
          <div className={styles.summary}>
            <span className="num">{formatNumber(locale, units.length)} {t("collection.summary.units")}</span>
            <span className="num">{formatNumber(locale, totalModels)} {t("collection.summary.models")}</span>
            <span className="num">{formatNumber(locale, pct)}% {t("collection.summary.painted")}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <a className="w-btn secondary" href="/api/export">{t("collection.action.export")}</a>
          <a className="w-btn secondary" href="/places">{t("collection.action.places")}</a>
          <a className="w-btn secondary" href="/paint">{t("collection.action.paint")}</a>
          <button type="button" className="w-btn" onClick={openAddUnit}>{t("collection.add.button")}</button>
        </div>
      </header>

      <StarterBoxesPanel boxes={starterBoxes} t={t} onAddOwnedUnit={openAddUnit} />

      {notice ? <div className={styles.notice} role="status">{notice} {undo?.length ? <button type="button" className="w-btn secondary" disabled={busy} onClick={() => runAction(() => undoCollectionMove(undo), t("collection.move.undone"))}>{t("collection.move.undo")}</button> : null}</div> : null}
      {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}

      <section className={styles.filters} aria-label={t("collection.title")}>
        <label>{t("collection.search")}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("collection.search")} /></label>
        <label>{t("collection.filter.place")}
          <select value={placeFilter} onChange={(event) => setPlaceFilter(event.target.value)}>
            <option value="all">{t("collection.filter.place")}</option>
            <option value="none">{t("collection.place.none")}</option>
            {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select>
        </label>
        <label>{t("collection.filter.stage")}
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="all">{t("collection.filter.stage")}</option>
            {stages.map((stage) => <option key={stage.id} value={stage.key}>{stage.label}</option>)}
          </select>
        </label>
        <label>{t("collection.filter.faction")}
          <select value={factionFilter} onChange={(event) => setFactionFilter(event.target.value)}>
            <option value="all">{t("collection.filter.faction")}</option>
            {factions.map((faction) => <option key={faction}>{faction}</option>)}
          </select>
        </label>
        {(search || placeFilter !== "all" || stageFilter !== "all" || factionFilter !== "all") ? <button className="w-btn secondary" type="button" onClick={() => { setSearch(""); setPlaceFilter("all"); setStageFilter("all"); setFactionFilter("all"); }}>{t("collection.filter.clear")}</button> : null}
      </section>

      {selectedModels.length ? <div className={styles.selectionBar}>
        <span>{t("collection.models.selected", { count: formatNumber(locale, selectedModels.length) })}</span>
        <button type="button" className="w-btn secondary" disabled={busy} onClick={() => openMove({ kind: "models", modelIds: [...selectedModels] })}>{t("collection.move.selected")}</button>
        <button type="button" className="w-btn secondary" disabled={busy} onClick={() => setDialog("deleteModels")}>{t("collection.models.removeSelected")}</button>
      </div> : null}

      {!units.length ? <section className="w-card card-pad empty-row"><p>{t("collection.empty")}</p><button className="w-btn" type="button" onClick={openAddUnit}>{t("collection.empty.action")}</button></section>
        : visibleUnits.length === 0 ? <section className="w-card card-pad empty-row">{t("collection.filter.empty")}</section>
          : <section className={styles.unitList}>
            {visibleUnits.map(({ unit, visibleModels }) => {
              const open = expanded.includes(unit.id);
              const allPlaces = new Set(unit.models.map((model) => model.placeId));
              const placeSummary = allPlaces.size > 1 ? t("collection.place.split") : allPlaces.has(null) ? t("collection.place.none") : places.find((place) => place.id === unit.models[0]?.placeId)?.name ?? t("collection.place.none");
              return <article className="w-card" key={unit.id}>
                <div className={styles.unitHead}>
                  <button type="button" className={styles.unitTitle} aria-expanded={open} onClick={() => toggleExpanded(unit.id)}>
                    <strong>{unit.name}</strong><span>{unit.faction || t("collection.unit.faction")}</span>
                    {unit.catalogueUnitId ? <span>{t("collection.catalogue.linked", { name: unit.catalogueName || unit.catalogueUnitId })}</span> : null}
                  </button>
                  <div className={styles.unitMeta}><span className="num">{formatNumber(locale, unit.models.length)} {t("collection.summary.models")}</span><span>{placeSummary}</span></div>
                  <div className={styles.unitButtons}>
                    <button type="button" className="w-btn secondary" disabled={busy} onClick={() => openEdit(unit)}>{t("collection.unit.edit")}</button>
                    <button type="button" className="w-btn secondary" disabled={busy} onClick={() => openMove({ kind: "unit", itemId: unit.id })}>{t("collection.move.unit")}</button>
                    <button type="button" className="w-btn secondary" disabled={busy} onClick={() => { setActiveUnit(unit); setDialog("delete"); }}>{t("collection.unit.delete")}</button>
                  </div>
                </div>
                {open ? <div className={styles.unitBody}>
                  {unit.loadout ? <p>{unit.loadout}</p> : null}
                  {unit.referenceImages.length ? <section aria-label={t("collection.reference.label")}><h3>{t("collection.reference.label")}</h3><div className={styles.photos}>{unit.referenceImages.map((asset) => <ReferenceTile key={asset.imageUrl || asset.id} asset={asset} alt={unit.catalogueName || unit.name} t={t} />)}</div></section> : null}
                  {unit.photos.length ? <h3>{t("collection.photo.ownerLabel")}</h3> : null}
                  {unit.photos.length ? <div className={styles.photos}>{unit.photos.map((photo) => <PhotoTile key={photo.id} id={photo.id} caption={photo.caption} alt={unit.name} t={t} onDelete={(id) => { setDeletePhotoId(id); setDialog("deletePhoto"); }} />)}</div> : null}
                  <PhotoUpload itemId={unit.id} alt={unit.name} t={t} onUploaded={() => router.refresh()} />
        <label className={styles.unitStage}>{t("collection.paint")}
                    <select value={unit.models.every((model) => model.stageId === unit.models[0]?.stageId) ? unit.models[0]?.stageId : ""} disabled={busy} onChange={(event) => runAction(() => updateModelPaintStage(unit.models.map((model) => model.id), Number(event.target.value)), t("paint.changed"))}>
                    <option value="">{t("collection.paint.mixed")}</option>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}
                    </select>
                  </label>
                  <div className={styles.modelList}>
                    {visibleModels.map((model) => <div className={styles.modelRow} key={model.id}>
                      <label className={styles.modelSelect}><input type="checkbox" checked={selectedModels.includes(model.id)} onChange={() => toggleModel(model.id)} /><span>{model.label || t("collection.model", { ordinal: formatNumber(locale, model.ordinal) })}</span></label>
                      <label className={styles.modelStage}>{t("collection.paint")}
                        <select value={model.stageId} disabled={busy} onChange={(event) => runAction(() => updateModelPaintStage([model.id], Number(event.target.value)), t("paint.changed"))}>
                          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                        </select>
                      </label>
                      <span className={styles.modelPlace}>{places.find((place) => place.id === model.placeId)?.name || t("collection.place.none")}</span>
                      {model.photos.length ? <div className={styles.photos}>{model.photos.map((photo) => <PhotoTile key={photo.id} id={photo.id} caption={photo.caption} alt={model.label || unit.name} t={t} onDelete={(id) => { setDeletePhotoId(id); setDialog("deletePhoto"); }} />)}</div> : null}
                      <PhotoUpload modelId={model.id} alt={model.label || unit.name} t={t} onUploaded={() => router.refresh()} />
                    </div>)}
                  </div>
                  <div className={styles.countEditor}>
                    <label>{t("collection.unit.count")}<input type="number" min={unit.models.length} max={500} value={countTarget} onChange={(event) => setCountTarget(event.target.value)} /></label>
                    <button type="button" className="w-btn secondary" disabled={busy} onClick={() => setUnitCount(unit)}>{t("collection.unit.resize")}</button>
                    <span>{t("collection.unit.reduceHint")}</span>
                  </div>
                </div> : null}
              </article>;
            })}
          </section>}

      {dialog === "add" || dialog === "edit" ? <Dialog title={dialog === "edit" ? t("collection.unit.edit") : t("collection.add.title")} closeLabel={t("collection.dialog.close")} discardPrompt={t("collection.dialog.unsaved")} dirty={formDirty} onClose={() => setDialog(null)} footer={<><button className="w-btn secondary" type="button" onClick={() => { if (!formDirty || window.confirm(t("collection.dialog.unsaved"))) setDialog(null); }}>{t("collection.action.cancel")}</button><button className="w-btn" type="submit" form="unit-form" disabled={busy}>{busy ? t("collection.action.saving") : t("collection.action.save")}</button></>}>
        <form id="unit-form" onSubmit={submitUnit} className={styles.form}>
          <label>{t("collection.catalogue.profile")}<select value={form.catalogueUnitId} onChange={(event) => {
            const catalogueUnitId = event.target.value;
            const profile = catalogueProfiles.find((item) => item.id === catalogueUnitId);
            setForm({ ...form, catalogueUnitId, ...(profile ? { name: profile.name, faction: profile.faction || form.faction } : {}) });
            setFormDirty(true);
          }}>
            <option value="">{t("collection.catalogue.none")}</option>
            {form.catalogueUnitId && !catalogueProfiles.some((profile) => profile.id === form.catalogueUnitId) ? <option value={form.catalogueUnitId}>{activeUnit?.catalogueName || form.catalogueUnitId}</option> : null}
            {catalogueProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}{profile.faction ? " · " + profile.faction : ""}</option>)}
          </select></label>
          <label>{t("collection.unit.name")}<input required maxLength={120} value={form.name} onChange={(event) => { setForm({ ...form, name: event.target.value }); setFormDirty(true); }} /></label>
          <label>{t("collection.unit.faction")}<input maxLength={120} value={form.faction} onChange={(event) => { setForm({ ...form, faction: event.target.value }); setFormDirty(true); }} /></label>
          <label>{t("collection.unit.loadout")}<textarea maxLength={1000} rows={3} value={form.loadout} onChange={(event) => { setForm({ ...form, loadout: event.target.value }); setFormDirty(true); }} /></label>
          {dialog === "add" ? <label>{t("collection.add.models")}<input type="number" min={1} max={500} required value={form.models} onChange={(event) => { setForm({ ...form, models: event.target.value }); setFormDirty(true); }} /></label> : null}
          {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}
        </form>
      </Dialog> : null}
      {dialog === "delete" && activeUnit ? <Dialog title={t("collection.unit.delete")} closeLabel={t("collection.dialog.close")} discardPrompt={t("collection.dialog.unsaved")} onClose={() => setDialog(null)} footer={<><button autoFocus className="w-btn secondary" type="button" onClick={() => setDialog(null)}>{t("collection.action.cancel")}</button><button className={styles.danger + " w-btn"} type="button" disabled={busy} onClick={() => runAction(() => deleteCollectionUnit(activeUnit.id))}>{t("collection.unit.delete")}</button></>}>
        <p>{t("collection.unit.deleteConfirm", { unit: activeUnit.name, count: activeUnit.models.length })}</p>
      </Dialog> : null}
      {dialog === "deletePhoto" && deletePhotoId ? <Dialog title={t("collection.photo.delete")} closeLabel={t("collection.dialog.close")} discardPrompt={t("collection.dialog.unsaved")} onClose={() => setDialog(null)} footer={<><button autoFocus className="w-btn secondary" type="button" onClick={() => setDialog(null)}>{t("collection.action.cancel")}</button><button className={styles.danger + " w-btn"} type="button" disabled={busy} onClick={() => runAction(() => deletePhoto(deletePhotoId))}>{t("collection.photo.delete")}</button></>}>
        <p>{t("collection.photo.deleteConfirm")}</p>
      </Dialog> : null}
      {dialog === "deleteModels" ? <Dialog title={t("collection.models.removeSelected")} closeLabel={t("collection.dialog.close")} discardPrompt={t("collection.dialog.unsaved")} onClose={() => setDialog(null)} footer={<><button autoFocus className="w-btn secondary" type="button" onClick={() => setDialog(null)}>{t("collection.action.cancel")}</button><button className={styles.danger + " w-btn"} type="button" disabled={busy} onClick={() => runAction(() => removeSelectedCollectionModels(selectedModels))}>{t("collection.models.removeSelected")}</button></>}>
        <p>{t("collection.models.removeConfirm", { count: formatNumber(locale, selectedModels.length) })}</p>
      </Dialog> : null}
      {moveTarget ? <Dialog title={t(moveTarget.kind === "unit" ? "collection.move.unit" : "collection.move.selected")} closeLabel={t("collection.dialog.close")} discardPrompt={t("collection.dialog.unsaved")} onClose={() => setMoveTarget(null)} footer={<><button className="w-btn secondary" type="button" onClick={() => setMoveTarget(null)}>{t("collection.action.cancel")}</button><button className="w-btn" type="button" disabled={busy} onClick={submitMove}>{t(moveTarget.kind === "unit" ? "collection.move.unit" : "collection.move.selected")}</button></>}>
        <label className={styles.moveSelect}>{t("collection.place")}
          <select value={movePlaceId} onChange={(event) => setMovePlaceId(event.target.value)}>
            <option value="">{t("collection.place.none")}</option>{places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select>
        </label>
      </Dialog> : null}
    </div>
  );
}
