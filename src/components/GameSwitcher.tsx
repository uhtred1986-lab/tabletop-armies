"use client";
import { useTransition } from "react";
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
export const GameSwitcher = ({ current }: { current: GameId }) => {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="switcher" role="group" aria-label={t("nav.hub")} aria-busy={pending}>
      {games.map((g) => (
        <button
          key={g.id}
          type="button"
          aria-pressed={g.id === current}
          onClick={() =>
            start(async () => {
              const r = await setGame(g.id);
              if (r.ok) router.refresh();
            })
          }
        >
          <span className="dot" style={{ background: markToken[g.id] }} />
          {t(g.nameKey as StringKey)}
        </button>
      ))}
    </div>
  );
};
