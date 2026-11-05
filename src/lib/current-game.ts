import "server-only";
import { cookies } from "next/headers";
import { gameById, games } from "@/games/registry";
import type { GameId, GameModule } from "@/games/types";

/** The game the owner is looking at, and with it the world on <html> (docs/ui-standard.md §3). A cookie, so the
 * server renders the right world on the first paint — no flash of the wrong theme. */
export const GAME_COOKIE = "muster-game";

export const isGameId = (v: string | undefined): v is GameId => games.some((g) => g.id === v);

export async function currentGame(): Promise<GameModule> {
  const v = (await cookies()).get(GAME_COOKIE)?.value;
  return gameById(isGameId(v) ? v : "aos");
}
