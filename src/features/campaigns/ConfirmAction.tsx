"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { StringKey } from "@/i18n";
import { useT } from "@/i18n/client";
import type { FormAction } from "./ActionForm";
import { ActionForm } from "./ActionForm";
import styles from "./campaigns.module.css";

export function ConfirmAction({
  triggerKey,
  confirmText,
  action,
  actionKey,
  fields,
  successHref,
}: {
  triggerKey: StringKey;
  confirmText: string;
  action: FormAction;
  actionKey: StringKey;
  fields: ReactNode;
  successHref?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const onSuccess = useCallback(() => {
    setOpen(false);
    if (successHref) router.push(successHref);
  }, [router, successHref]);
  return (
    <>
      <button type="button" className={`btn secondary w-btn ${styles.destructive}`} onClick={() => setOpen(true)}>{t(triggerKey)}</button>
      {open && (
        <div className={styles.dialogShade}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className={styles.dialog}>
            <header className={styles.dialogHeader}>
              <h2 id="confirm-title" className="card-title">{t(triggerKey)}</h2>
              <button type="button" className={`btn secondary w-btn ${styles.close}`} aria-label={t("action.close")} onClick={() => setOpen(false)}>×</button>
            </header>
            <div className={styles.dialogBody}><p>{confirmText}</p></div>
            <footer className={styles.dialogFooter}>
              <button autoFocus type="button" className="btn secondary w-btn" onClick={() => setOpen(false)}>{t("action.cancel")}</button>
              <ActionForm action={action} submitKey={actionKey} className={styles.dialogAction} danger onSuccess={onSuccess}>{fields}</ActionForm>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
