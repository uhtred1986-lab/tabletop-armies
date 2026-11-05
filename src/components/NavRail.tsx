"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { StringKey } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { setLocale } from "@/app/actions";

const NAV: [string, StringKey][] = [
  ["/", "nav.hub"],
  ["/collection", "nav.collection"],
  ["/lists", "nav.lists"],
  ["/play", "nav.play"],
  ["/kit", "nav.kit"],
];

/** The left rail: sections, the language toggle and sign-out. */
export const NavRail = () => {
  const t = useT();
  const locale = useLocale();
  const path = usePathname();
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <nav className="rail" aria-label={t("app.name")}>
      <div className="w-display rail-title">{t("app.name")}</div>
      {NAV.map(([href, key]) => (
        <Link key={href} href={href} aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}>
          {t(key)}
        </Link>
      ))}
      <div className="rail-foot">
        <button
          type="button"
          className="rail-link"
          onClick={() =>
            start(async () => {
              const r = await setLocale(locale === "de" ? "en" : "de");
              if (r.ok) router.refresh();
            })
          }
        >
          {t("nav.language")}
        </button>
        <form method="post" action="/api/auth/logout">
          <button type="submit" className="rail-link">{t("nav.signOut")}</button>
        </form>
      </div>
    </nav>
  );
};
