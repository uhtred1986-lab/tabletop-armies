"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { games } from "@/games/registry";
import type { GameId } from "@/games/types";
import type { StringKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { setGame } from "@/app/actions";

const markToken: Record<GameId, string> = {
  aos: "var(--game-aos)",
  mcp: "var(--game-mcp)",
  legion: "var(--game-legion)",
  shatterpoint: "var(--game-shatterpoint)",
  bmg: "var(--game-bmg)",
};

/** Picks the game, and with it the world (docs/design/system/README.md, GameSwitcher). */
export const GameSwitcher = ({ current, compact = false }: { current: GameId; compact?: boolean }) => {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const changeGame = (id: GameId) => start(async () => {
    if (id === current || !window.dispatchEvent(new Event("tabletop:before-game-change", { cancelable: true }))) return;
    setFailed(false);
    try {
      const result = await setGame(id);
      if (result.ok) router.refresh();
      else setFailed(true);
    } catch { setFailed(true); }
  });
  if (compact) return <div className="header-game-control"><label className="header-game"><span className="label">{t("nav.game")}</span>
    <select value={current} disabled={pending} onChange={(event) => {
      const id = event.target.value as GameId;
      changeGame(id);
    }}>{games.map((game) => <option key={game.id} value={game.id}>{t(game.nameKey as StringKey)}</option>)}</select>
  </label>{failed && <p role="alert">{t("error.body")}</p>}</div>;
  return (
    <div className="switcher" role="group" aria-label={t("nav.hub")} aria-busy={pending}>
      {games.map((g) => (
        <button
          key={g.id}
          type="button"
          aria-pressed={g.id === current}
          disabled={pending}
          onClick={() => changeGame(g.id)}
        >
          <span className="dot" style={{ background: markToken[g.id] }} />
          {t(g.nameKey as StringKey)}
        </button>
      ))}
      {failed && <p role="alert">{t("error.body")}</p>}
    </div>
  );
};
