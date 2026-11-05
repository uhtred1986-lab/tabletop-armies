import type { ReactNode } from "react";
import { requireOwnerPage } from "@/lib/auth";
import { NavRail } from "@/components/NavRail";
import { GameSwitcher } from "@/components/GameSwitcher";
import { currentGame } from "@/lib/current-game";
import { getT } from "@/i18n/server";
import { OfflineRuntime } from "@/components/OfflineRuntime";

/** Every owner screen: signed in (second lock after the proxy), the rail on the left. */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const owner = await requireOwnerPage();
  const [game, t] = await Promise.all([currentGame(), getT()]);
  return (
    <div className="shell">
      <OfflineRuntime owner={owner.email} world={game.world} />
      <NavRail owner={owner.email} />
      <div className="workspace">
        <header className="app-header"><GameSwitcher current={game.id} compact /><span className="label app-header-name">{t("app.name")}</span></header>
        <main id="main-content" className="main">{children}</main>
      </div>
    </div>
  );
}
