"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/i18n/client";
import { setLocale } from "@/app/actions";
import { OfflineSignOutButton } from "@/components/OfflineSignOutButton";

export function MoreActions({ owner }: { owner: string }) {
  const t = useT(), locale = useLocale(), router = useRouter();
  const [pending, start] = useTransition();
  return <div className="row-gap">
    <button type="button" className="btn secondary w-btn" disabled={pending} onClick={() => start(async () => {
      const result = await setLocale(locale === "de" ? "en" : "de"); if (result.ok) router.refresh();
    })}>{t("nav.language")}</button>
    <OfflineSignOutButton owner={owner} label={t("nav.signOut")} queuedWarning={(count) => t("play.discardOffline", { count })} clearFailure={t("play.clearOfflineFailed")} />
  </div>;
}
