"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatNumber, type Locale } from "@/i18n";
import { collectionT, type CollectionKey } from "@/i18n/features/collection";
import { createStoragePlace, deleteStoragePlace, updateStoragePlace } from "../collection/actions";
import styles from "./places.module.css";

type Place = { id: number; name: string; kind: string | null; notes: string | null; models: number };
function ConfirmDialog({ title, closeLabel, discardPrompt, dirty, children, onClose, footer }: { title: string; closeLabel: string; discardPrompt: string; dirty?: boolean; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.showModal();
    return () => { if (node.open) node.close(); };
  }, []);
  const requestClose = () => { if (!dirty || window.confirm(discardPrompt)) onClose(); };
  return <dialog ref={ref} className={styles.dialog} aria-modal="true" aria-label={title} onCancel={(event) => { event.preventDefault(); requestClose(); }}>
    <header><h2 className="w-display">{title}</h2><button type="button" className="w-btn secondary" aria-label={closeLabel} onClick={requestClose}>×</button></header>
    <div className={styles.dialogBody}>{children}</div>
    <footer>{footer}</footer>
  </dialog>;
}

export function PlacesWorkspace({ locale, places, failed }: { locale: Locale; places: Place[]; failed: boolean }) {
  const t = collectionT(locale);
  const router = useRouter();
  const [busy, start] = useTransition();
  const [editing, setEditing] = useState<Place | null>(null);
  const [deleting, setDeleting] = useState<Place | null>(null);
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "case", notes: "" });
  const edit = (place?: Place) => {
    setEditing(place ?? null);
    setForm(place ? { name: place.name, kind: place.kind || "case", notes: place.notes || "" } : { name: "", kind: "case", notes: "" });
    setError("");
    setDirty(false);
    setDialog(true);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    start(async () => {
      const result = editing
        ? await updateStoragePlace({ id: editing.id, ...form })
        : await createStoragePlace(form);
      if (!result.ok) { setError(result.error === "duplicate-or-save-failed" ? t("places.duplicate") : t("collection.action.failed")); return; }
      setDialog(false);
      router.refresh();
    });
  };
  const remove = () => {
    if (!deleting) return;
    setError("");
    start(async () => {
      const result = await deleteStoragePlace(deleting.id);
      if (!result.ok) { setError(t("collection.action.failed")); return; }
      setDeleting(null);
      router.refresh();
    });
  };
  const kindLabel = (kind: string | null) => kind ? t(("places.kind." + kind) as CollectionKey) : t("places.kind.unknown");
  if (failed) return <section className="w-card card-pad" role="alert">{t("collection.error")} <button className="w-btn secondary" onClick={() => router.refresh()}>{t("collection.action.retry")}</button></section>;
  return <div className={styles.workspace}>
    <div className={styles.intro}><p>{t("places.description")}</p><button type="button" className="w-btn" onClick={() => edit()}>{t("places.add")}</button></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!places.length ? <section className="w-card card-pad">{t("places.empty")}</section> : <section className={styles.list}>
      {places.map((place) => <article className="w-card" key={place.id}>
        <div className={styles.place}>
          <div><h2>{place.name}</h2><span className="label">{kindLabel(place.kind)}</span>{place.notes ? <p>{place.notes}</p> : null}</div>
          <div className={styles.meta}><span className="num">{formatNumber(locale, place.models)}</span><span>{t("collection.summary.models")}</span></div>
          <div className={styles.actions}>
            <a className="w-btn secondary" href={"/collection?place=" + place.id}>{t("places.filter")}</a>
            <button className="w-btn secondary" type="button" onClick={() => edit(place)}>{t("places.rename")}</button>
            <button className="w-btn secondary" type="button" onClick={() => { setDeleting(place); setError(""); }}>{t("places.delete")}</button>
          </div>
        </div>
      </article>)}
    </section>}
    {dialog ? <ConfirmDialog title={editing ? t("places.rename") : t("places.add")} closeLabel={t("collection.dialog.close")} discardPrompt={t("collection.dialog.unsaved")} dirty={dirty} onClose={() => setDialog(false)} footer={<><button className="w-btn secondary" type="button" onClick={() => { if (!dirty || window.confirm(t("collection.dialog.unsaved"))) setDialog(false); }}>{t("collection.action.cancel")}</button><button className="w-btn" type="submit" form="place-form" disabled={busy}>{t("collection.action.save")}</button></>}>
      <form id="place-form" className={styles.form} onSubmit={submit}>
        <label>{t("places.name")}<input required maxLength={100} value={form.name} onChange={(event) => { setForm({ ...form, name: event.target.value }); setDirty(true); }} /></label>
        <label>{t("places.kind")}<select value={form.kind} onChange={(event) => { setForm({ ...form, kind: event.target.value }); setDirty(true); }}>
          {(["case", "box", "shelf", "away"] as const).map((kind) => <option key={kind} value={kind}>{t(("places.kind." + kind) as CollectionKey)}</option>)}
        </select></label>
        <label>{t("places.notes")}<textarea rows={3} maxLength={500} value={form.notes} onChange={(event) => { setForm({ ...form, notes: event.target.value }); setDirty(true); }} /></label>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </form>
    </ConfirmDialog> : null}
    {deleting ? <ConfirmDialog title={t("places.delete")} closeLabel={t("collection.dialog.close")} discardPrompt={t("collection.dialog.unsaved")} onClose={() => setDeleting(null)} footer={<><button className="w-btn secondary" type="button" onClick={() => setDeleting(null)}>{t("collection.action.cancel")}</button><button className={styles.danger + " w-btn"} type="button" disabled={busy} onClick={remove}>{t("places.delete")}</button></>}>
      <p>{t("places.deleteConfirm", { place: deleting.name })}</p>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </ConfirmDialog> : null}
  </div>;
}
