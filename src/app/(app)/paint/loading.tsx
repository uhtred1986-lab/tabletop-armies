"use client";

import { useLocale } from "@/i18n/client";
import { collectionT } from "@/i18n/features/collection";

export default function PaintLoading() {
  const t = collectionT(useLocale());
  return <section className="w-card card-pad" aria-busy="true" aria-live="polite">{t("paint.loading")}</section>;
}
