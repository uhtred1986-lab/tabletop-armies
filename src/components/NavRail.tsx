"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { StringKey } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { setLocale } from "@/app/actions";
import { Icon, type IconName } from "./Icon";
import { OfflineSignOutButton } from "./OfflineSignOutButton";

export const NAV_ITEMS: readonly [string, StringKey, IconName][] = [
  ["/", "nav.hub", "games"], ["/collection", "nav.collection", "collection"],
  ["/places", "nav.places", "places"], ["/lists", "nav.lists", "lists"],
  ["/reference", "nav.reference", "reference"],
  ["/play", "nav.play", "play"], ["/paint", "nav.paint", "paint"],
  ["/stats", "nav.stats", "stats"], ["/campaigns", "nav.campaigns", "campaigns"],
  ["/data", "nav.data", "data"],
];
const MOBILE = NAV_ITEMS.filter(([href]) => ["/collection", "/lists", "/play", "/paint"].includes(href));

/** The same destinations, with controls suited to the available screen width. */
export const NavRail = ({ owner }: { owner: string }) => {
  const t = useT();
  const locale = useLocale();
  const path = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = (href: string) => href === "/" ? path === "/" : path.startsWith(href);
  const localeButton = <button type="button" className="rail-link" disabled={pending} onClick={() => start(async () => {
    const result = await setLocale(locale === "de" ? "en" : "de"); if (result.ok) router.refresh();
  })}>{t("nav.language")}</button>;
  return <>
    <nav className="rail desktop-nav" aria-label={t("nav.navigation")}>
      <Link href="/" className="w-display rail-title">{t("app.name")}</Link>
      <div className="rail-items">{NAV_ITEMS.map(([href, key, icon]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}>
        <Icon name={icon} /><span>{t(key)}</span>
      </Link>)}</div>
      <div className="rail-foot">
        {localeButton}
        <Link href="/kit"><Icon name="settings" /><span>{t("nav.kit")}</span></Link>
        <OfflineSignOutButton owner={owner} label={t("nav.signOut")} queuedWarning={(count) => t("play.discardOffline", { count })} clearFailure={t("play.clearOfflineFailed")} />
      </div>
    </nav>
    <nav className="mobile-nav" aria-label={t("nav.navigation")}>
      {MOBILE.map(([href, key, icon]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}><Icon name={icon} /><span>{t(key)}</span></Link>)}
      <Link href="/more" aria-current={!MOBILE.some(([href]) => active(href)) ? "page" : undefined}><Icon name="more" /><span>{t("nav.more")}</span></Link>
    </nav>
  </>;
};
