import Link from "next/link";
import type { CSSProperties } from "react";
import type { HomeData } from "@/features/home/types";
import { dropCap, formatPlayedOn, ledgerBanners, ledgerEntries } from "@/games/aos/home";
import { formatNumber } from "@/i18n";
import { getT } from "@/i18n/server";
import s from "./ledger.module.css";

const BANNER_LIMIT = 5;
const ENTRY_LIMIT = 6;
const TONES = [s.tone0, s.tone1, s.tone2, s.tone3, s.tone4, s.tone5];

/**
 * The sigmar world home: an open war ledger (docs/ui-standard.md §3, "World homes"). Left page, the host: every faction
 * as a hanging banner that fills with ink as its models are painted. Right page: the ready-made Spearheads of the
 * owner's pack as ledger entries. Only the owner's data; every empty part names what is missing and offers the step.
 */
export async function Ledger({ data }: { data: HomeData }) {
  const t = await getT();
  const n = (value: number) => formatNumber(data.locale, value);
  const { banners, hidden: hiddenBanners } = ledgerBanners(data.factions, BANNER_LIMIT);
  const { entries, hidden: hiddenEntries } = ledgerEntries(data.readyMade, ENTRY_LIMIT);
  const hasPack = data.pack !== undefined;
  // One accent thing per screen: the step that matters most right now.
  const accent: "muster" | "host" | "data" = entries.length > 0 ? "muster" : banners.length === 0 ? "host" : "data";
  const latestList = data.lists[0];
  const game = data.activeGame ?? data.recentGames[0];

  const tabs = [
    { href: "/lists", label: t("home.ledger.tab.lists") },
    { href: "/play", label: t("home.ledger.tab.play") },
    { href: "/paint", label: t("home.ledger.tab.paint") },
    { href: "/campaigns", label: t("home.ledger.tab.campaigns") },
    { href: "/collection", label: t("home.ledger.tab.collection") },
  ];

  const modelsLabel = (count: number) => count === 1 ? t("home.ledger.banner.modelsOne") : t("home.ledger.banner.models", { count: n(count) });

  let gameLine: React.ReactNode;
  if (game && game.result === null) {
    const date = formatPlayedOn(data.locale, game.playedOn);
    gameLine = <>
      <span>{game.opponent ? t("home.ledger.game.running", { opponent: game.opponent, date }) : t("home.ledger.game.runningAlone", { date })}</span>
      <Link className={s.inlineAction} href={`/play?id=${game.id}`}>{t("home.ledger.game.continue")}</Link>
    </>;
  } else if (game && game.result !== null) {
    const date = formatPlayedOn(data.locale, game.playedOn);
    const result = t(`home.ledger.game.${game.result}`);
    gameLine = <span>{game.opponent ? t("home.ledger.game.last", { date, opponent: game.opponent, result }) : t("home.ledger.game.lastAlone", { date, result })}</span>;
  } else {
    gameLine = <>
      <span>{t("home.ledger.game.none")}</span>
      <Link className={s.inlineAction} href="/play">{t("home.ledger.game.start")}</Link>
    </>;
  }

  return (
    <div className={s.ledger}>
      <nav className={s.tabs} aria-label={t("home.ledger.tabs")}>
        <Link className={`${s.tab} ${s.tabCurrent}`} href="/" aria-current="page">{t("home.ledger.tab.host")}</Link>
        {tabs.map((tab) => <Link key={tab.href} className={s.tab} href={tab.href}>{tab.label}</Link>)}
      </nav>

      <div className={s.book} role="group" aria-label={t("home.ledger.book")}>
        <section className={`${s.page} ${s.pageLeft}`} aria-labelledby="ledger-host">
          <header className={s.head}>
            <h1 id="ledger-host" className={s.title}>{t("home.ledger.host.title")}</h1>
            <p className={s.lede}>{t("home.ledger.host.lede")}</p>
          </header>
          <div className={s.rule} aria-hidden="true" />

          {banners.length > 0 ? <>
            <ul className={s.banners} style={{ "--count": banners.length } as CSSProperties}>
              {banners.map((banner) => {
                const name = banner.name || t("home.ledger.banner.noFaction");
                const models = modelsLabel(banner.models);
                return (
                  <li key={banner.name || "-"} className={s.bannerItem}>
                    <Link
                      href="/paint"
                      className={`${s.banner} ${TONES[banner.tone]}`}
                      aria-label={t("home.ledger.banner.label", { name, percent: n(banner.percent), models })}
                    >
                      <span className={s.cord} aria-hidden="true" />
                      <span className={s.cloth} aria-hidden="true">
                        <span className={s.ink} style={{ "--fill": `${banner.percent}%` } as CSSProperties} />
                        <span className={s.percent}>{t("home.ledger.banner.percent", { percent: n(banner.percent) })}</span>
                      </span>
                      <span className={s.bannerName} aria-hidden="true">{name}</span>
                      <span className={s.bannerCount} aria-hidden="true">{models}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className={s.tally}>
              <span>{data.totals.models === 1
                ? t("home.ledger.host.tallyOne", { painted: n(data.totals.painted) })
                : t("home.ledger.host.tally", { painted: n(data.totals.painted), models: n(data.totals.models) })}</span>
              {hiddenBanners > 0 && <Link className={s.inlineAction} href="/collection">
                {hiddenBanners === 1 ? t("home.ledger.banner.moreOne") : t("home.ledger.banner.more", { count: n(hiddenBanners) })}
              </Link>}
            </p>
          </> : (
            <div className={s.empty}>
              <span className={s.emptyShelf} aria-hidden="true"><span /><span /><span /></span>
              <h2 className={s.emptyTitle}>{t("home.ledger.host.emptyTitle")}</h2>
              <p className={s.emptyBody}>{t("home.ledger.host.emptyBody")}</p>
              <Link className={accent === "host" ? s.primary : s.secondary} href="/collection">{t("home.ledger.host.emptyAction")}</Link>
            </div>
          )}

          <footer className={s.chronicle}>
            <p className={s.chronicleLine}>
              {gameLine}
              {data.recentGames.length > 0 && <Link className={s.inlineAction} href="/games">{t("home.allGames")}</Link>}
            </p>
            <p className={s.chronicleLine}>
              {latestList ? <>
                <span>{t("home.ledger.list.latest", { name: latestList.name, state: t(latestList.status === "complete" ? "home.ledger.list.complete" : "home.ledger.list.incomplete") })}</span>
                <Link className={s.inlineAction} href="/lists">{t("home.ledger.list.open")}</Link>
              </> : <>
                <span>{t("home.ledger.list.none")}</span>
                <Link className={s.inlineAction} href="/lists">{t("home.ledger.list.create")}</Link>
              </>}
            </p>
          </footer>
        </section>

        <div className={s.gutter} aria-hidden="true" />

        <section className={`${s.page} ${s.pageRight}`} aria-labelledby="ledger-muster">
          <header className={s.head}>
            <h2 id="ledger-muster" className={s.subtitle}>{t("home.ledger.muster.title")}</h2>
            <p className={s.lede}>{t("home.ledger.muster.lede")}</p>
          </header>
          <div className={s.rule} aria-hidden="true" />

          {entries.length > 0 ? <>
            <ol className={s.entries}>
              {entries.map((entry) => {
                const { initial, rest } = dropCap(entry.name);
                const units = entry.unitCount === 1 ? t("home.ledger.muster.unitsOne") : t("home.ledger.muster.units", { count: n(entry.unitCount) });
                return (
                  <li key={entry.id} className={s.entry}>
                    <span className={s.entryText}>
                      <span className={s.entryName}><span className={s.initial}>{initial}</span>{rest}</span>
                      <span className={s.entryDetail}>{entry.factionName || t("home.ledger.muster.noFaction")}, {units}</span>
                    </span>
                    <span className={`${s.badge} ${entry.configured ? s.badgeReady : s.badgeOpen}`}>
                      <span className={s.badgeDot} aria-hidden="true" />
                      {t(entry.configured ? "home.ledger.muster.configured" : "home.ledger.muster.incomplete")}
                    </span>
                  </li>
                );
              })}
            </ol>
            {hiddenEntries > 0 && <p className={s.tally}>
              <Link className={s.inlineAction} href="/lists">
                {hiddenEntries === 1 ? t("home.ledger.muster.moreOne") : t("home.ledger.muster.more", { count: n(hiddenEntries) })}
              </Link>
            </p>}
            <div className={s.spacer} />
            <div className={s.actions}>
              <Link className={s.primary} href="/lists">{t("home.ledger.muster.take")}</Link>
              <Link className={s.secondary} href="/data">{t("home.ledger.muster.add")}</Link>
            </div>
          </> : (
            <div className={s.empty}>
              <h3 className={s.emptyTitle}>{t(hasPack ? "home.ledger.muster.emptyTitle" : "home.ledger.muster.noPackTitle")}</h3>
              <p className={s.emptyBody}>{t(hasPack ? "home.ledger.muster.emptyBody" : "home.ledger.muster.noPackBody")}</p>
              <Link className={accent === "data" ? s.primary : s.secondary} href="/data">
                {t(hasPack ? "home.ledger.muster.add" : "home.ledger.muster.noPackAction")}
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
