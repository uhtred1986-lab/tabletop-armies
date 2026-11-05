import { pgEnum } from "drizzle-orm/pg-core";

/** The games Muster knows (`src/games/types.ts` GameId). A new game is a new enum value, added by migration. */
export const gameIdEnum = pgEnum("game_id", ["aos", "mcp", "legion", "shatterpoint", "bmg"]);

/** Paint progress, in order (`PAINT_STAGES`). */
export const PAINT_STAGES = ["unbuilt", "built", "primed", "base", "shaded", "detailed", "based"] as const;
export type PaintStage = (typeof PAINT_STAGES)[number];
export const paintStageEnum = pgEnum("paint_stage", PAINT_STAGES);

export const gameResultEnum = pgEnum("game_result", ["win", "loss", "draw"]);
