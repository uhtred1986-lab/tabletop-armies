"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";
export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return <section className="w-card card-pad error-state" role="alert"><h1 className="w-display">{t("error.title")}</h1><p>{t("error.body")}</p><div className="row-gap"><button className="btn w-btn" onClick={reset}>{t("error.retry")}</button><Link className="btn secondary w-btn" href="/">{t("nav.hub")}</Link></div></section>;
}
