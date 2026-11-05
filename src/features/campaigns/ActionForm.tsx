"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import type { StringKey } from "@/i18n";
import { useT } from "@/i18n/client";
import styles from "./campaigns.module.css";

export type FormState = { ok?: boolean; error?: string };
export type FormAction = (previous: FormState, data: FormData) => Promise<FormState>;

export function ActionForm({
  action,
  submitKey,
  children,
  className,
  danger = false,
  onSuccess,
}: {
  action: FormAction;
  submitKey: StringKey;
  children: ReactNode;
  className?: string;
  danger?: boolean;
  onSuccess?: () => void;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (state.ok) onSuccess?.();
  }, [state.ok, onSuccess]);
  return (
    <form action={formAction} className={className}>
      {children}
      <button className={`btn secondary w-btn${danger ? ` ${styles.destructive}` : ""}`} type="submit" disabled={pending}>
        {t(submitKey)}
      </button>
      <span role="status" aria-live="polite" className="label">
        {pending ? t("campaigns.saving") : state.error ? t(state.error as StringKey) : state.ok ? t("campaigns.saved") : ""}
      </span>
    </form>
  );
}
