import type { GameId, GameModule } from "./types";
import { aos } from "./aos";
import { mcp } from "./mcp";
import { legion } from "./legion";
import { shatterpoint } from "./shatterpoint";
import { bmg } from "./bmg";

/** Every game Tabletop Armies knows, in switcher order. Adding a game: copy src/games/_template and list it here. */
export const games: GameModule[] = [aos, mcp, legion, shatterpoint, bmg];

export const gameById = (id: GameId): GameModule => {
  const game = games.find((g) => g.id === id);
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
};
