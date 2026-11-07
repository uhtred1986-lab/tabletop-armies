import type { HomeData } from "@/features/home/types";
import { getT } from "@/i18n/server";

/** The crisis world home (comic-page). Placeholder: replaced by the world's own design (docs/ui-standard.md §3). */
export async function ComicPage({ data }: { data: HomeData }) {
  const t = await getT();
  return <h1 className="w-display page-title">{t("home.comicpage.title")} · {data.totals.models}</h1>;
}
