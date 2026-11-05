import { bigserial, date, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { gameIdEnum, gameResultEnum } from "./enums";

/** One game played (or being played) at the table. Its state is replayed from `gameEvents` (CLAUDE.md rule 4). */
export const playedGames = pgTable(
  "played_games",
  {
    id: serial("id").primaryKey(),
    gameId: gameIdEnum("game_id").notNull(),
    /** The owner's list(s) used; kept as ids plus names in the first event, so a deleted list leaves the log readable. */
    listIds: integer("list_ids").array().notNull().default([]),
    opponent: text("opponent"),
    playedOn: date("played_on").notNull(),
    result: gameResultEnum("result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("played_games_game_idx").on(t.gameId, t.playedOn)],
);

/** The game log. `seq` orders events within a game; undo deletes the highest `seq`, nothing else. */
export const gameEvents = pgTable(
  "game_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    playedGameId: integer("played_game_id")
      .notNull()
      .references(() => playedGames.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
  },
  (t) => [uniqueIndex("game_events_game_seq_uq").on(t.playedGameId, t.seq)],
);
