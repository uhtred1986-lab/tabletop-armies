import Link from "next/link";
import type { CSSProperties } from "react";
import type { HomeData, HomeGame, HomeList } from "@/features/home/types";
import { listPack } from "@/features/home/list-pack";
import type { StringKey, T } from "@/i18n";
import { formatNumber } from "@/i18n";
import { getT } from "@/i18n/server";
import { legionFieldMap, paintedPercent, rankSlots, type FieldToken, type LegionFieldMap } from "@/games/legion/home";
import styles from "./field-map.module.css";

/**
 * The legion world home: a tactical field map (docs/ui-standard.md §3, "World homes"). A telemetry strip, the latest
 * list's units as diamond order tokens, its command hand beside the map, rank slots along the bottom. Only the owner's
 * real data; every empty part names what is missing and links to where it is fixed.
 */
export async function FieldMap({ data }: { data: HomeData }) {
  const t = await getT();
  const n = (value: number) => formatNumber(data.locale, value);
  const list = data.lists[0];
  const packContent = listPack(list)?.content;
  const map = list ? legionFieldMap(list.definition, packContent) : null;
  const primary = data.activeGame
    ? { href: `/play?id=${data.activeGame.id}`, key: "home.fieldmap.action.continue" as const }
    : list ? { href: "/lists", key: "home.fieldmap.action.openLists" as const } : { href: "/lists", key: "home.fieldmap.action.buildList" as const };

  return (
    <div className={styles.root}>
      <Telemetry data={data} t={t} n={n} />
      <div className={styles.field}>
        <MapArea list={list} map={map} t={t} n={n} />
        <aside className={styles.side} aria-labelledby="field-hand">
          <CommandHand map={map} hasList={Boolean(list)} t={t} n={n} />
          <Link href={primary.href} className={`w-btn w-display ${styles.primary}`}>{t(primary.key)}</Link>
        </aside>
      </div>
      <RankSlots map={map} t={t} n={n} />
    </div>
  );
}

type Fmt = (value: number) => string;

function gameDate(locale: HomeData["locale"], iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(locale === "de" ? "de-AT" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

const RESULT_KEY = { win: "play.win", loss: "play.loss", draw: "play.draw" } as const;

function Telemetry({ data, t, n }: { data: HomeData; t: T; n: Fmt }) {
  const shown: HomeGame | undefined = data.activeGame ?? data.recentGames[0];
  const percent = paintedPercent(data.totals.painted, data.totals.models);
  return (
    <header className={styles.telemetry}>
      <h1 className={`w-display ${styles.title}`}>{t("home.fieldmap.title")}</h1>
      <dl className={styles.readouts} aria-label={t("home.fieldmap.telemetry")}>
        <div className={styles.readout}>
          <dt>{t("home.fieldmap.tele.game")}</dt>
          <dd>{t(data.game.nameKey as StringKey)}</dd>
        </div>
        <div className={styles.readout}>
          <dt>{t("home.fieldmap.tele.status")}</dt>
          <dd>
            {shown ? (
              <>
                <span>{shown.result === null ? t("home.fieldmap.tele.running") : t("home.fieldmap.tele.last", { result: t(RESULT_KEY[shown.result]) })}</span>
                <span className={styles.sub}>
                  {shown.opponent ? `${t("home.fieldmap.tele.vs", { opponent: shown.opponent })}, ` : ""}
                  <time dateTime={shown.playedOn}>{gameDate(data.locale, shown.playedOn)}</time>
                </span>
              </>
            ) : (
              <>
                <span className={styles.muted}>{t("home.fieldmap.tele.noGames")}</span>
                <Link href="/play" className={styles.inline}>{t("home.fieldmap.action.start")}</Link>
              </>
            )}
          </dd>
        </div>
        <div className={styles.readout}>
          <dt>{t("home.fieldmap.tele.painted")}</dt>
          <dd>
            {percent === null ? (
              <>
                <span className={styles.muted}>{t("home.fieldmap.tele.noModels")}</span>
                <Link href="/collection" className={styles.inline}>{t("home.fieldmap.action.openCollection")}</Link>
              </>
            ) : (
              <>
                <span className="num">{t("home.fieldmap.tele.paintedValue", { painted: n(data.totals.painted), models: n(data.totals.models) })}</span>
                <span className={`num ${styles.sub}`}>{t("home.fieldmap.tele.percent", { percent: n(percent) })}</span>
                <span className={styles.gauge} aria-hidden="true"><span style={{ "--fill": `${percent}%` } as CSSProperties} /></span>
              </>
            )}
          </dd>
        </div>
      </dl>
      <Link href="/games" className={styles.allGames}>{t("home.allGames")}</Link>
    </header>
  );
}

function rankWords(t: T, rank: FieldToken["rank"]) {
  const id = rank ?? "unknown";
  return { label: t(`home.fieldmap.rank.${id}` as StringKey), code: t(`home.fieldmap.code.${id}` as StringKey) };
}

function MapArea({ list, map, t, n }: { list: HomeList | undefined; map: LegionFieldMap | null; t: T; n: Fmt }) {
  if (!list) {
    return (
      <section className={`${styles.map} ${styles.mapEmpty}`} aria-labelledby="field-map-empty">
        {/* The side column's primary action builds the list; no second link for the same thing. */}
        <p id="field-map-empty" className={styles.emptyText}>{t("home.fieldmap.map.empty")}</p>
      </section>
    );
  }
  const issues = list.issues.length;
  return (
    <section className={styles.map} aria-label={t("home.fieldmap.map.label", { name: list.name })}>
      <div className={styles.mapHead}>
        <span className={styles.kicker}>{t("home.fieldmap.map.latest")}</span>
        <h2 className={`w-display ${styles.listName}`}>{list.name}</h2>
        <p className={styles.listFacts}>
          {map ? <span className="num">{t("home.fieldmap.map.points", { points: n(map.pointsLimit) })}</span> : null}
          <span className={list.status === "complete" ? styles.ok : styles.warn}>{t(list.status === "complete" ? "home.fieldmap.map.complete" : "home.fieldmap.map.incomplete")}</span>
          {issues ? <span className="num">{t("home.fieldmap.map.issues", { count: n(issues) })}</span> : null}
        </p>
      </div>
      {!map ? (
        <div className={styles.mapNote}><p className={styles.emptyText}>{t("home.fieldmap.map.unreadable")}</p><Link href="/lists" className={styles.inline}>{t("home.fieldmap.action.openLists")}</Link></div>
      ) : map.tokens.length === 0 ? (
        <div className={styles.mapNote}><p className={styles.emptyText}>{t("home.fieldmap.map.noUnits")}</p><Link href="/lists" className={styles.inline}>{t("home.fieldmap.action.openLists")}</Link></div>
      ) : (
        <>
          <ul className={styles.tokens}>
            {map.tokens.map((token) => {
              const words = rankWords(t, token.rank);
              return (
                <li key={token.key} className={styles.cell} style={{ "--dx": token.dx, "--dy": token.dy } as CSSProperties}>
                  <span className={styles.token}>
                    <span className={`${styles.diamond} ${token.rank === "commander" ? styles.diamondCommand : ""} ${token.rank === null ? styles.diamondUnknown : ""}`} aria-hidden="true">
                      <span>{words.code}</span>
                    </span>
                    <span className={styles.tokenText}>
                      <span className={styles.tokenName}>{token.name}</span>
                      <span className={styles.tokenMeta}>{words.label}{token.count > 1 ? ` ${t("home.fieldmap.token.count", { count: n(token.count) })}` : ""}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {!map.packKnown ? <p className={styles.mapFoot}>{t("home.fieldmap.map.noPack")}</p> : null}
          <p className={styles.mapFoot}>{t("home.fieldmap.map.hint")}</p>
        </>
      )}
    </section>
  );
}

function pipText(pips: number | null): string {
  if (pips === null) return "";
  return pips >= 1 && pips <= 3 ? "◆".repeat(pips) : String(pips);
}

function CommandHand({ map, hasList, t, n }: { map: LegionFieldMap | null; hasList: boolean; t: T; n: Fmt }) {
  const hand = map?.commandHand ?? [];
  return (
    <div className={styles.hand}>
      <h2 id="field-hand" className={`w-display ${styles.sideTitle}`}>{t("home.fieldmap.hand.title")}</h2>
      {hand.length ? (
        <>
          <p className={`num ${styles.sub}`}>{t("home.fieldmap.hand.count", { count: n(hand.length) })}</p>
          <ol className={styles.cards}>
            {hand.map((card, index) => (
              <li key={`${index}:${card.id}`} className={styles.card}>
                <span className={card.name ? undefined : styles.muted}>{card.name ?? t("home.fieldmap.hand.unknownCard", { id: card.id })}</span>
                {card.pips !== null ? <span className={`num ${styles.pips}`} aria-label={t("home.fieldmap.hand.pips", { count: n(card.pips) })}>{pipText(card.pips)}</span> : null}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className={styles.handEmpty}>
          <p className={styles.emptyText}>{hasList ? t("home.fieldmap.hand.empty") : t("home.fieldmap.ranks.none")}</p>
          {hasList ? <Link href="/lists" className={styles.inline}>{t("home.fieldmap.action.openLists")}</Link> : null}
        </div>
      )}
    </div>
  );
}

function RankSlots({ map, t, n }: { map: LegionFieldMap | null; t: T; n: Fmt }) {
  if (!map || map.tokens.length === 0) {
    return (
      <section className={styles.ranks} aria-labelledby="field-ranks">
        <h2 id="field-ranks" className={styles.ranksTitle}>{t("home.fieldmap.ranks.label")}</h2>
        <p className={styles.emptyText}>{t("home.fieldmap.ranks.empty")}</p>
      </section>
    );
  }
  return (
    <section className={styles.ranks} aria-labelledby="field-ranks">
      <div className={styles.ranksHead}>
        <h2 id="field-ranks" className={styles.ranksTitle}>{t("home.fieldmap.ranks.label")}</h2>
        {!map.limitsConfigured ? <p className={styles.sub}>{t("home.fieldmap.ranks.limitsNote")}</p> : null}
        {map.unranked ? <p className={styles.warn}>{t("home.fieldmap.ranks.unranked", { count: n(map.unranked) })}</p> : null}
      </div>
      <ul className={styles.rankRow}>
        {map.ranks.map((rank) => {
          const slots = rankSlots(rank);
          const anyLimit = map.ranks.some((r) => r.limit !== null);
          return (
            <li key={rank.rank} className={styles.rank}>
              <span className={styles.rankName}>
                {t(`home.fieldmap.rank.${rank.rank}` as StringKey)}{" "}
                <span className="num">{rank.limit ? t("home.fieldmap.ranks.countOf", { count: n(rank.count), min: n(rank.limit.min), max: n(rank.limit.max) }) : n(rank.count)}</span>
              </span>
              <span className={styles.slots} aria-hidden="true">
                {slots.map((filled, i) => <span key={i} className={filled ? styles.slotFilled : styles.slot} />)}
              </span>
              <span className={styles.rankNote}>
                {rank.units.length ? rank.units.join(", ") : t("home.fieldmap.ranks.none")}
                {rank.limit || !anyLimit ? null : <span className={styles.muted}> {t("home.fieldmap.ranks.noLimit")}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
