import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { GameId } from "@/games/types";
import { gameById } from "@/games/registry";

interface GameState {
  gameId: GameId;
  setGameId: (id: GameId) => void;
}

const GameContext = createContext<GameState | null>(null);
const STORAGE_KEY = "muster.game";

const readStored = (): GameId => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "mcp" || v === "legion" || v === "shatterpoint" || v === "bmg" ? v : "aos";
  } catch {
    return "aos";
  }
};

/** Holds the current game and puts its world on <html> (docs/ui-standard.md §3). */
export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [gameId, setGameId] = useState<GameId>(readStored);

  useEffect(() => {
    const { world } = gameById(gameId);
    document.documentElement.dataset.world = world;
    document.documentElement.dataset.theme = world;
    try {
      localStorage.setItem(STORAGE_KEY, gameId);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, [gameId]);

  return <GameContext.Provider value={{ gameId, setGameId }}>{children}</GameContext.Provider>;
};

export const useGame = () => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame outside GameProvider");
  return ctx;
};
