import { games } from "@/games/registry";
import { useT } from "@/i18n";
import { useGame } from "@/app/GameContext";

const markToken: Record<string, string> = {
  aos: "var(--game-aos)",
  mcp: "var(--game-mcp)",
  legion: "var(--game-legion)",
  shatterpoint: "var(--game-shatterpoint)",
  bmg: "var(--game-bmg)",
};

/** Picks the game, and with it the world (docs/design/system README, GameSwitcher). */
export const GameSwitcher = () => {
  const t = useT();
  const { gameId, setGameId } = useGame();
  return (
    <div className="switcher" role="group" aria-label={t("nav.hub")}>
      {games.map((g) => (
        <button key={g.id} type="button" aria-pressed={g.id === gameId} onClick={() => setGameId(g.id)}>
          <span className="dot" style={{ background: markToken[g.id] }} />
          {t(g.nameKey as never)}
        </button>
      ))}
    </div>
  );
};
