"use client";

import { useLocale } from "@/i18n/client";
import { collectionT } from "@/i18n/features/collection";

export default function CollectionLoading() {
  const t = collectionT(useLocale());
  return <section className="w-card card-pad" aria-busy="true" aria-live="polite">{t("collection.loading")}</section>;
}
