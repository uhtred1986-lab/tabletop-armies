import Link from "next/link";
import type { HomeList } from "@/features/home/types";
import type { CaseFileSummary } from "@/games/bmg/home";
import type { T } from "@/i18n";
import s from "../case-file.module.css";

type PackState = "none" | "missing" | "other" | "ok";

/** The left index card of the case file: the latest crew as a typewritten roster, or what is missing. */
export function IndexCard({ t, num, list, summary, packState, noModels, moreCrews, primary }: {
  t: T;
  num: (n: number) => string;
  list: HomeList | undefined;
  summary: CaseFileSummary | undefined;
  packState: PackState;
  noModels: boolean;
  moreCrews: number;
  /** True when building a crew is the screen's one primary action (no crew, no running game). */
  primary: boolean;
}) {
  const money = (n: number) => t("home.casefile.money", { amount: num(n) });
  const missing = <abbr className={s.missing} title={t("home.casefile.unknown")}>—</abbr>;

  const notes: { body: string; href: string; action: string }[] = [];
  if (noModels) notes.push({ body: t("home.casefile.noModels.body"), href: "/collection", action: t("home.casefile.noModels.action") });
  if (list && packState === "missing") notes.push({ body: t("home.casefile.noPack.body"), href: "/data", action: t("home.casefile.noPack.action") });
  if (list && packState === "other") notes.push({ body: t("home.casefile.otherPack.body"), href: "/lists", action: t("home.casefile.openInLists") });
  if (list && summary && !summary.readable) notes.push({ body: t("home.casefile.unreadable.body"), href: "/lists", action: t("home.casefile.openInLists") });

  if (!list) {
    return (
      <article className={s.card}>
        <header className={s.cardHead}>
          <h1 id="case-file-title" className={s.cardTitle}>{t("home.casefile.noCrew.title")}</h1>
          <span className={s.caseNo}>{t("home.casefile.title")}</span>
        </header>
        <p className={s.record}>{t("home.casefile.noCrew.body")}</p>
        <Link href="/lists" className={primary ? s.primary : s.paperBtn}>{t("home.casefile.noCrew.action")}</Link>
        <Notes notes={notes} />
      </article>
    );
  }

  const left = summary?.fundingLeft ?? null;
  return (
    <article className={s.card}>
      <header className={s.cardHead}>
        <h1 id="case-file-title" className={s.cardTitle}>{list.name}</h1>
        <span className={s.caseNo}>{t("home.casefile.caseNo", { id: String(list.id).padStart(4, "0") })}</span>
      </header>
      <Notes notes={notes} />
      {summary?.readable && (summary.rows.length === 0 ? (
        <p className={s.record}>{t("home.casefile.emptyRoster")}</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.roster}>
            <caption className={s.srOnly}>{t("home.casefile.roster")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("home.casefile.col.model")}</th>
                <th scope="col">{t("home.casefile.col.rank")}</th>
                <th scope="col" className={s.right}>{t("home.casefile.col.rep")}</th>
                <th scope="col" className={s.right}>{t("home.casefile.col.funding")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.name ?? t("home.casefile.notInPack", { id: row.modelId })}</th>
                  <td>{row.rank ? t(`home.casefile.rank.${row.rank}`) : missing}</td>
                  <td className={s.right}>{row.rep === null ? missing : num(row.rep)}</td>
                  <td className={s.right}>{row.funding === null ? missing : money(row.funding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {summary?.readable && summary.repLimit !== null && summary.fundingLimit !== null && (
        <footer className={s.cardFoot}>
          <p className={s.totals}>
            <span>{summary.repUsed === null
              ? t("home.casefile.repUnknown", { limit: num(summary.repLimit) })
              : t("home.casefile.rep", { used: num(summary.repUsed), limit: num(summary.repLimit) })}</span>
            <span>{summary.fundingUsed === null
              ? t("home.casefile.fundingUnknown", { limit: money(summary.fundingLimit) })
              : t("home.casefile.funding", { used: money(summary.fundingUsed), limit: money(summary.fundingLimit) })}</span>
          </p>
          {left !== null && (
            <p className={s.stamp} data-over={left < 0 ? "" : undefined}>
              {left < 0 ? t("home.casefile.stamp.over", { amount: num(-left) }) : t("home.casefile.stamp.left", { amount: num(left) })}
            </p>
          )}
        </footer>
      )}
      {moreCrews > 0 && <Link href="/lists" className={s.paperLink}>{t("home.casefile.moreCrews", { count: num(moreCrews) })}</Link>}
    </article>
  );
}

function Notes({ notes }: { notes: { body: string; href: string; action: string }[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className={s.notes}>
      {notes.map((note) => (
        <li key={note.body} className={s.note}>
          <span>{note.body}</span>
          <Link href={note.href} className={s.paperLink}>{note.action}</Link>
        </li>
      ))}
    </ul>
  );
}
