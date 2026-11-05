import { getT } from "@/i18n/server";
export default async function Loading() {
  const t = await getT();
  return <div className="w-card card-pad" role="status" aria-live="polite">{t("loading.label")}</div>;
}
