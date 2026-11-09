import Link from "next/link";
import type { HomeData } from "@/features/home/types";
import { getT } from "@/i18n/server";
import { formatNumber } from "@/i18n";
import { caseFileSummary, casePins } from "@/games/bmg/home";
import { IndexCard } from "./case-file/IndexCard";
import { Corkboard } from "./case-file/Corkboard";
import s from "./case-file.module.css";

/**
 * The gotham world home (case-file; docs/ui-standard.md §3, "World homes"): a manila folder open on the desk. Tabs on
 * its top edge lead to the crew's parts; the index card holds the latest crew, the corkboard its checks. Only the
 * owner's data is shown; every derived number comes from `src/games/bmg/home.ts`.
 */
export async function CaseFile({ data }: { data: HomeData }) {
  const t = await getT();
  const num = (n: number) => formatNumber(data.locale, n);
  const list = data.lists[0];
  // Every list carries the pack it was built against, so a crew on an older or other pack still shows its numbers.
  const summary = list ? caseFileSummary(list.definition, list.packContent) : undefined;
  const pins = list ? casePins(list.issues, list.status) : [];
  const active = data.activeGame;

  const tabs = [
    { href: "/lists", key: "home.casefile.tab.crew" },
    { href: "/lists", key: "home.casefile.tab.equipment" },
    { href: "/lists", key: "home.casefile.tab.objectives" },
    { href: "/play", key: "home.casefile.tab.play" },
    { href: "/paint", key: "home.casefile.tab.paint" },
  ] as const;

  return (
    <section className={s.desk} aria-labelledby="case-file-title">
      <div className={s.tabRow}>
        <nav aria-label={t("home.casefile.tabs")} className={s.tabs}>
          {tabs.map((tab, i) => (
            <Link key={tab.key} href={tab.href} className={i === 0 ? `${s.tab} ${s.tabFront}` : s.tab}>{t(tab.key)}</Link>
          ))}
        </nav>
        <Link href="/games" className={s.allGames}>{t("home.allGames")}</Link>
      </div>
      <div className={s.folder}>
        <IndexCard
          t={t}
          num={num}
          list={list}
          summary={summary}
          packState={!list ? "none" : list.packContent === undefined ? "missing" : "ok"}
          noModels={data.totals.models === 0}
          moreCrews={Math.max(0, data.lists.length - 1)}
          primary={!list && !active}
        />
        <Corkboard
          t={t}
          num={num}
          hasCrew={list !== undefined}
          status={list?.status}
          pins={pins}
          deckCards={summary?.readable ? summary.deckCards : undefined}
          active={active}
        />
      </div>
    </section>
  );
}
