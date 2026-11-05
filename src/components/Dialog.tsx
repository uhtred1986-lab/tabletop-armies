"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { Icon } from "./Icon";

/** Native modal focus containment, responsive sheet, and explicit unsaved-edit handling. */
export function Dialog({ open, title, children, footer, onClose, dirty = false }: {
  open: boolean; title: string; children: ReactNode; footer?: ReactNode;
  onClose: () => void; dirty?: boolean;
}) {
  const t = useT();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (open && node && !node.open) node.showModal();
    if (!open && node?.open) node.close();
    return () => { if (node?.open) node.close(); };
  }, [open]);
  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else { setConfirmDiscard(false); onClose(); }
  };
  return <dialog ref={ref} className="app-dialog" aria-labelledby={id}
    onCancel={(event) => { event.preventDefault(); requestClose(); }}>
    <header className="dialog-header">
      <h2 id={id} className="w-display">{title}</h2>
      <button type="button" className="icon-button" aria-label={t("action.close")} onClick={requestClose}><Icon name="close" /></button>
    </header>
    {confirmDiscard ? <>
      <div className="dialog-body" role="alert"><p>{t("dialog.unsaved")}</p></div>
      <footer className="dialog-footer">
        <button type="button" className="btn secondary w-btn" autoFocus onClick={() => setConfirmDiscard(false)}>{t("dialog.keepEditing")}</button>
        <button type="button" className="btn danger w-btn" onClick={() => { setConfirmDiscard(false); onClose(); }}>{t("dialog.discard")}</button>
      </footer>
    </> : <><div className="dialog-body">{children}</div>{footer && <footer className="dialog-footer">{footer}</footer>}</>}
  </dialog>;
}
