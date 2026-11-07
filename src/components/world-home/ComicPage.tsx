import Link from "next/link";
import type { HomeData, HomeGame } from "@/features/home/types";
import { comicSquad, type ComicSquad } from "@/games/mcp/home";
import { getT } from "@/i18n/server";
import { formatNumber, type T } from "@/i18n";
import s from "./comic-page.module.css";

/**
 * The crisis world home (comic-page, docs/ui-standard.md §3 "World homes"): the screen is a comic page. A splash
 * panel for the latest list with its threat in a burst, character panels, crises and team tactics, and the
 * previous issues (games). Everything is the owner's data or an empty state that names the next step.
 */
export async function ComicPage({ data }: { data: HomeData }) {
  const t = await getT();
  const n = (value: number) => formatNumber(data.locale, value);
  const date = (iso: string) => formatDay(data.locale, iso);
  const list = data.lists[0];
  const squad = list ? comicSquad(list, data.pack) : undefined;
  const playHref = data.activeGame ? `/play?id=${data.activeGame.id}` : "/play";

  return (
    <section className={s.page} aria-label={t("home.comicpage.title")}>
      <article className={s.splash}>
        <div className={s.splashTop}>
          <p className={s.caption}>{meanwhile(t, data, date)}</p>
          {squad?.threatLimit !== undefined ? (
            <div className={s.burst} aria-label={`${t("home.comicpage.threat")} ${n(squad.threatLimit)}`} role="img">
              <div className={s.burstInner} aria-hidden="true">
                <span className={s.burstNumber}>{n(squad.threatLimit)}</span>
                <span className={s.burstLabel}>{t("home.comicpage.threat")}</span>
              </div>
            </div>
          ) : null}
        </div>
        <div className={s.splashBody}>
          {list ? (
            <>
              {squad ? (
                <p className={s.kicker}>
                  {t(squad.kind === "squad" ? "list.mcp.squad" : "list.mcp.roster")}
                  {squad.affiliation ? <span> / {squad.affiliation}</span> : null}
                </p>
              ) : null}
              <h1 className={s.headline}>{list.name}</h1>
              {squad ? (
                <p className={s.lede}>
                  {t("home.comicpage.summary", { characters: n(squad.characters.length), crises: n(squad.crises.length), tactics: n(squad.tactics.length) })}
                  {squad.threatLimit !== undefined && squad.threatUsed !== undefined
                    ? <> {t("home.comicpage.threatUsed", { used: n(squad.threatUsed), limit: n(squad.threatLimit) })}</>
                    : null}
                </p>
              ) : null}
              <p className={s.status} data-status={list.status}>
                {list.status === "complete" ? t("home.comicpage.ready") : t("home.comicpage.openPoints", { count: n(list.issues.length) })}
              </p>
            </>
          ) : (
            <>
              <h1 className={s.headline}>{t("home.comicpage.noList")}</h1>
              <p className={s.lede}>{t("home.comicpage.noListText")}</p>
            </>
          )}
          <div className={s.actions}>
            {list ? (
              <>
                <Link className={s.cta} href={playHref}>
                  <span>{t(data.activeGame ? "home.comicpage.continueGame" : "home.comicpage.startGame")}</span>
                </Link>
                <Link className={s.secondary} href="/lists">{t("home.comicpage.editList")}</Link>
              </>
            ) : (
              <>
                <Link className={s.cta} href="/lists"><span>{t("home.comicpage.buildList")}</span></Link>
                {data.activeGame ? <Link className={s.secondary} href={playHref}>{t("home.comicpage.continueGame")}</Link> : null}
              </>
            )}
          </div>
        </div>
      </article>

      <Cast t={t} n={n} data={data} squad={list ? squad : undefined} hasList={Boolean(list)} />

      {squad ? <Crises t={t} n={n} squad={squad} /> : null}
      {squad ? <Tactics t={t} n={n} squad={squad} /> : null}

      <section className={s.previously} aria-labelledby="comic-previously">
        <div className={s.previouslyHead}>
          <h2 id="comic-previously" className={s.panelTitle}>{t("home.comicpage.previously")}</h2>
          <Link className={s.textLink} href="/games">{t("home.allGames")}</Link>
        </div>
        {data.recentGames.length ? (
          <ol className={s.games}>
            {data.recentGames.map((game) => (
              <li key={game.id}>
                <Link className={s.gameRow} href={`/play?id=${game.id}`} data-running={game.result === null || undefined}>
                  <span className={s.gameDate}>{date(game.playedOn)}</span>
                  <span className={s.gameResult}>{result(t, game)}</span>
                  <span className={s.gameOpponent}>{game.opponent ? t("home.comicpage.against", { opponent: game.opponent }) : t("home.comicpage.noOpponent")}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className={s.empty}>{t("home.comicpage.noGames")}</p>
        )}
      </section>
    </section>
  );
}

type N = (value: number) => string;

/** Character panels of the latest list; without a list, the largest collection factions; else the empty state. */
function Cast({ t, n, data, squad, hasList }: { t: T; n: N; data: HomeData; squad?: ComicSquad; hasList: boolean }) {
  if (hasList) {
    const characters = squad?.characters ?? [];
    if (!characters.length) {
      return (
        <section className={s.cast} aria-labelledby="comic-cast">
          <h2 id="comic-cast" className={s.srOnly}>{t("home.comicpage.characters")}</h2>
          <EmptyPanel text={t("home.comicpage.noCharacters")} href="/lists" action={t("home.comicpage.addCharacters")} />
        </section>
      );
    }
    const shown = characters.length > 4 ? characters.slice(0, 3) : characters;
    const rest = characters.length - shown.length;
    return (
      <section className={s.cast} aria-labelledby="comic-cast">
        <h2 id="comic-cast" className={s.srOnly}>{t("home.comicpage.characters")}</h2>
        {shown.map((c, i) => (
          <article key={`${c.id}-${i}`} className={s.hero}>
            {c.affiliations[0] || !c.known ? (
              <p className={s.tag}>{c.known ? c.affiliations[0] : t("home.comicpage.notInPack")}</p>
            ) : null}
            <h3 className={s.heroName}>{c.name}</h3>
            {c.stamina !== undefined || c.threat !== undefined ? (
              <dl className={s.stats}>
                {c.stamina !== undefined ? <div><dt>{t("tracker.mcp.stamina")}</dt><dd>{n(c.stamina)}</dd></div> : null}
                {c.threat !== undefined ? <div><dt>{t("home.comicpage.threat")}</dt><dd>{n(c.threat)}</dd></div> : null}
              </dl>
            ) : null}
          </article>
        ))}
        {rest > 0 ? (
          <Link className={s.more} href="/lists">
            <span className={s.moreCount}>{t("home.comicpage.moreCharacters", { count: n(rest) })}</span>
            <span>{t("home.comicpage.moreCharactersText")}</span>
          </Link>
        ) : null}
      </section>
    );
  }
  const factions = data.factions.filter((f) => f.models > 0).slice(0, 4);
  return (
    <section className={s.cast} aria-labelledby="comic-cast">
      <h2 id="comic-cast" className={factions.length ? s.castTitle : s.srOnly}>{t("home.comicpage.collection")}</h2>
      {factions.length ? factions.map((f) => (
        <article key={f.name || "-"} className={s.hero}>
          <h3 className={s.heroName}>{f.name || t("home.comicpage.noFaction")}</h3>
          <p className={s.heroNote}>{t("home.comicpage.painted", { painted: n(f.painted), models: n(f.models) })}</p>
        </article>
      )) : <EmptyPanel text={t("home.comicpage.noModels")} href="/collection" action={t("home.comicpage.addModels")} />}
    </section>
  );
}

function Crises({ t, n, squad }: { t: T; n: N; squad: ComicSquad }) {
  return (
    <section className={s.crises} aria-labelledby="comic-crises">
      <h2 id="comic-crises" className={s.panelTitle}>{t("home.comicpage.crises")}</h2>
      {squad.crises.length ? (
        <ul className={s.crisisList}>
          {squad.crises.map((c, i) => (
            <li key={`${c.id}-${i}`} className={s.crisis}>
              <span className={s.crisisType}>{t(c.type === "secure" ? "home.comicpage.secure" : c.type === "extract" ? "home.comicpage.extract" : "home.comicpage.crisis")}</span>
              <b className={s.crisisName}>{c.name}</b>
              {c.threat !== undefined ? <span className={s.crisisThreat}>{t("home.comicpage.crisisThreat", { threat: n(c.threat) })}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.inlineEmpty}>{t("home.comicpage.noCrises")} <Link className={s.textLink} href="/lists">{t("home.comicpage.chooseCrises")}</Link></p>
      )}
    </section>
  );
}

function Tactics({ t, n, squad }: { t: T; n: N; squad: ComicSquad }) {
  const shown = squad.tactics.slice(0, 6);
  const rest = squad.tactics.length - shown.length;
  return (
    <section className={s.tactics} aria-labelledby="comic-tactics">
      <h2 id="comic-tactics" className={s.panelTitle}>{t("home.comicpage.tactics")}</h2>
      {shown.length ? (
        <ul className={s.chips}>
          {shown.map((c, i) => <li key={`${c.id}-${i}`} className={s.chip}>{c.name}</li>)}
          {rest > 0 ? <li className={s.chipMore}>{t("home.comicpage.moreTactics", { count: n(rest) })}</li> : null}
        </ul>
      ) : (
        <p className={s.inlineEmptyDark}>{t("home.comicpage.noTactics")} <Link className={s.textLinkDark} href="/lists">{t("home.comicpage.chooseTactics")}</Link></p>
      )}
    </section>
  );
}

function EmptyPanel({ text, href, action }: { text: string; href: string; action: string }) {
  return (
    <div className={s.emptyPanel}>
      <p>{text}</p>
      <Link className={s.secondary} href={href}>{action}</Link>
    </div>
  );
}

function meanwhile(t: T, data: HomeData, date: (iso: string) => string): string {
  const running = data.activeGame;
  if (running) {
    return running.opponent
      ? t("home.comicpage.meanwhileRunning", { opponent: running.opponent, date: date(running.playedOn) })
      : t("home.comicpage.meanwhileRunningSolo", { date: date(running.playedOn) });
  }
  const last = data.recentGames[0];
  if (!last) return t("home.comicpage.firstIssue");
  return last.opponent
    ? t("home.comicpage.lastTime", { date: date(last.playedOn), result: result(t, last), opponent: last.opponent })
    : t("home.comicpage.lastTimeSolo", { date: date(last.playedOn), result: result(t, last) });
}

function result(t: T, game: HomeGame): string {
  if (game.result === "win") return t("home.comicpage.result.win");
  if (game.result === "loss") return t("home.comicpage.result.loss");
  if (game.result === "draw") return t("home.comicpage.result.draw");
  return t("home.comicpage.running");
}

function formatDay(locale: "de" | "en", iso: string): string {
  const day = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "de" ? "de-AT" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(day);
}
