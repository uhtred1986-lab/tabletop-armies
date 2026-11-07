import Link from "next/link";
import type { HomeGame } from "@/features/home/types";
import type { CasePin } from "@/games/bmg/home";
import { strings, type StringKey, type T } from "@/i18n";
import s from "../case-file.module.css";

/** At most this many index cards fit the board; the rest are counted and lead to Lists. */
const MAX_PINS = 6;
const isKey = (key: string): key is StringKey => key in strings.en;

/** The right half of the case file: the crew's checks pinned as index cards, the deck count and the way to the table. */
export function Corkboard({ t, num, hasCrew, status, pins, deckCards, active }: {
  t: T;
  num: (n: number) => string;
  hasCrew: boolean;
  status: "complete" | "incomplete" | undefined;
  pins: CasePin[];
  deckCards: number | undefined;
  active: HomeGame | undefined;
}) {
  const shown = pins.slice(0, MAX_PINS);
  const hidden = pins.length - shown.length;
  return (
    <section className={s.cork} aria-labelledby="case-file-checks">
      <h2 id="case-file-checks" className={s.corkTitle}>{t("home.casefile.checks")}</h2>
      {!hasCrew ? (
        <p className={s.corkNote}>{t("home.casefile.noCrew.checks")}</p>
      ) : shown.length === 0 ? (
        status === "incomplete" && <p className={s.corkNote}>{t("home.casefile.noChecks")}</p>
      ) : (
        <ul className={s.pins}>
          {shown.map((pin, i) => (
            <li key={`${pin.messageKey}-${i}`} className={s.pin} data-tone={pin.tone}>
              <span aria-hidden="true" className={s.pinHead} />
              <p className={s.pinText}>{isKey(pin.messageKey) ? t(pin.messageKey, pin.values) : pin.messageKey}</p>
              <p className={s.pinState}>{t(`home.casefile.state.${pin.tone}`)}</p>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && <Link href="/lists" className={s.corkLink}>{t("home.casefile.moreChecks", { count: num(hidden) })}</Link>}
      <div className={s.corkFoot}>
        {deckCards !== undefined && <p className={s.corkNote}>{t("home.casefile.deck", { count: num(deckCards) })}</p>}
        <div className={s.actions}>
          {active && (
            <Link href={`/play?id=${active.id}`} className={s.primary}>
              {active.opponent ? t("home.casefile.continueAgainst", { opponent: active.opponent }) : t("home.casefile.continue")}
            </Link>
          )}
          {hasCrew && <Link href="/play" className={active ? s.quietBtn : s.primary}>{t("home.casefile.toTable")}</Link>}
        </div>
      </div>
    </section>
  );
}
