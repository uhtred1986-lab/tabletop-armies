import Link from "next/link";
import type { HomeData } from "@/features/home/types";
import { getT } from "@/i18n/server";
import { formatNumber, strings, type StringKey, type T } from "@/i18n";
import { gameById } from "@/games/registry";
import type { Issue } from "@/games/types";
import { duelView, type DuelSquad, type DuelTeam, type DuelView } from "@/games/shatterpoint/home";
import styles from "./duel.module.css";

/**
 * The saga world home: a letterboxed duel (docs/ui-standard.md §3, "World homes"). Your latest strike team on the
 * left faces the last opponent on the right; the middle holds the duel itself: start or continue, and the record.
 * Only the owner's real data; every empty part names what is missing and links to where it is fixed.
 */
export async function DuelScreen({ data }: { data: HomeData }) {
  const t = await getT();
  const view = duelView(data);
  const n = (value: number) => formatNumber(data.locale, value);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(data.locale === "de" ? "de-AT" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className={styles.letterbox}>
      <div className={styles.stage}>
        <header className={styles.head}>
          <h1 className={`w-display ${styles.title}`}>{t("home.duel.title")}</h1>
          <Link href="/games" className={styles.quiet}>{t("home.allGames")}</Link>
        </header>

        <section className={styles.you} aria-labelledby="duel-you">
          <h2 id="duel-you" className={styles.sideLabel}>{t("home.duel.you")}</h2>
          {view.team ? <Team team={view.team} t={t} n={n} /> : <NoTeam t={t} noModels={data.totals.models === 0} />}
        </section>

        <section className={styles.struggle} aria-labelledby="duel-struggle">
          <h2 id="duel-struggle" className={styles.sideLabel}>{t("home.duel.struggle")}</h2>
          <Struggle view={view} data={data} t={t} n={n} date={date} />
        </section>

        <section className={styles.them} aria-labelledby="duel-them">
          <h2 id="duel-them" className={styles.sideLabel}>{t("home.duel.them")}</h2>
          {view.opponent || view.active ? (
            <article className={`${styles.card} ${styles.theirs}`}>
              <span className={styles.meta}>{t(view.active ? "home.duel.facing" : "home.duel.lastOpponent")}</span>
              <p className={styles.opponent}>{view.opponent ?? t("home.duel.unnamedOpponent")}</p>
              <p className={styles.note}>{t("home.duel.opponentOnlyName")}</p>
            </article>
          ) : (
            <article className={`${styles.card} ${styles.theirs} ${styles.empty}`}>
              <p className={styles.note}>{t("home.duel.noOpponent")}</p>
              <Link href="/play" className={`w-btn ${styles.ghost}`}>{t("home.duel.findOpponent")}</Link>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

type Fmt = (value: number) => string;

const issueText = (t: T, issue: Issue) =>
  issue.messageKey in strings.en ? t(issue.messageKey as StringKey, issue.values) : issue.messageKey;

function Team({ team, t, n }: { team: DuelTeam; t: T; n: Fmt }) {
  const more = team.errors + team.warnings - 1;
  return (
    <>
      <div className={styles.teamHead}>
        <p className={styles.teamName}>{team.name}</p>
        <span className={`${styles.chip} ${team.status === "complete" ? styles.chipOk : styles.chipWarn}`}>
          {t(team.status === "complete" ? "home.duel.complete" : "home.duel.incomplete")}
        </span>
      </div>
      {team.firstIssue && (
        <p className={styles.issue}>
          {issueText(t, team.firstIssue)}
          {more > 0 && <> {t("home.duel.moreIssues", { n: n(more) })}</>}
        </p>
      )}
      {team.squads.length === 0 ? <p className={styles.note}>{t("home.duel.noSquads")}</p> : team.squads.map((squad, i) => (
        <Squad key={i} squad={squad} index={i} t={t} n={n} />
      ))}
      <Link href="/lists" className={styles.quiet}>{t("home.duel.openList")}</Link>
    </>
  );
}

const MAX_PIPS = 12;

function Squad({ squad, index, t, n }: { squad: DuelSquad; index: number; t: T; n: Fmt }) {
  const points = squad.points;
  return (
    <div className={styles.squad}>
      <div className={styles.squadHead}>
        <h3 className={styles.squadName}>{t("home.duel.squad", { n: n(index + 1) })}</h3>
        {points ? (
          <span className={styles.points} aria-label={t("home.duel.squadPointsLabel", { spent: n(points.spent), budget: n(points.budget) })}>
            {Math.max(points.budget, points.spent) <= MAX_PIPS && (
              <span className={styles.pips} aria-hidden="true">
                {Array.from({ length: Math.max(points.budget, points.spent) }, (_, i) => (
                  <span key={i} className={`${styles.pip} ${i >= points.budget ? styles.pipOver : i < points.spent ? styles.pipOn : ""}`} />
                ))}
              </span>
            )}
            <span className="num" aria-hidden="true">{t("home.duel.squadPoints", { spent: n(points.spent), budget: n(points.budget) })}</span>
          </span>
        ) : (
          <span className={styles.meta}>{t("home.duel.squadPointsUnknown")}</span>
        )}
      </div>
      <ul className={styles.units}>
        {squad.units.map((unit, i) => (
          <li key={`${unit.id}-${i}`} className={`${styles.card} ${styles.mine}`}>
            <span className={styles.unitName}>{unit.name ?? unit.id}</span>
            <span className={styles.meta}>
              {unit.role ? t(`home.duel.role.${unit.role}`) : t("home.duel.role.unknown")}
              {unit.sp !== null && <> · {t("home.duel.unitSp", { sp: n(unit.sp) })}</>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoTeam({ t, noModels }: { t: T; noModels: boolean }) {
  return (
    <article className={`${styles.card} ${styles.mine} ${styles.empty}`}>
      <p className={styles.note}>{t("home.duel.noTeam")}</p>
      <Link href="/lists" className={`w-btn ${styles.ghost}`}>{t("home.duel.buildTeam")}</Link>
      {noModels && (
        <>
          <p className={styles.note}>{t("home.duel.noModels")}</p>
          <Link href="/collection" className={`w-btn ${styles.ghost}`}>{t("home.duel.addModels")}</Link>
        </>
      )}
    </article>
  );
}

function Struggle({ view, data, t, n, date }: { view: DuelView; data: HomeData; t: T; n: Fmt; date: (iso: string) => string }) {
  const { record, active, lastResult } = view;
  const decided = record.win + record.loss;
  const gameModule = gameById(data.game.id);
  return (
    <>
      {active && (
        <div className={styles.running}>
          <span className={styles.meta}>{t("home.duel.running", { date: date(active.playedOn) })}</span>
          <span className={styles.meta}>{t("home.duel.round", { phases: gameModule.phases.map((p) => t(p.labelKey as StringKey)).join(" · ") })}</span>
          <span className={styles.meta}>{t("home.duel.tracked", { trackers: (gameModule.trackers ?? []).map((k) => t(k.labelKey as StringKey)).join(", ") })}</span>
        </div>
      )}

      {record.games > 0 ? (
        <figure className={styles.score}>
          <p className={`w-display ${styles.scoreLine}`}>
            <span>{n(record.win)}</span>
            <span className={styles.vs}>{t("home.duel.vs")}</span>
            <span className={styles.scoreThem}>{n(record.loss)}</span>
          </p>
          {decided > 0 && (
            <div className={styles.momentum} aria-hidden="true">
              <span className={styles.momentumYou} style={{ inlineSize: `${(record.win / decided) * 100}%` }} />
            </div>
          )}
          <figcaption className={`${styles.meta} ${styles.caption}`}>
            <span>{t("home.duel.recordLabel", { n: n(record.games) })}</span>
            {record.draw > 0 && <span>{t("home.duel.recordDraws", { n: n(record.draw) })}</span>}
          </figcaption>
        </figure>
      ) : (
        <div className={styles.score}>
          <p className={`w-display ${styles.scoreLine} ${styles.scoreEmpty}`} aria-hidden="true">
            <span className={styles.vs}>{t("home.duel.vs")}</span>
          </p>
          <p className={styles.note}>{t("home.duel.noRecord")}</p>
        </div>
      )}

      <Link href={active ? `/play?id=${active.gameId}` : "/play"} className={`w-btn w-display ${styles.primary}`}>
        {t(active ? "home.duel.continue" : "home.duel.start")}
      </Link>

      {lastResult && (
        <p className={styles.meta}>
          {lastResult.opponent
            ? t("home.duel.lastResult", { result: t(`play.${lastResult.result}`), opponent: lastResult.opponent, date: date(lastResult.playedOn) })
            : t("home.duel.lastResultNoName", { result: t(`play.${lastResult.result}`), date: date(lastResult.playedOn) })}
        </p>
      )}
    </>
  );
}
