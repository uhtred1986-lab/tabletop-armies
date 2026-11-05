// The barrel: every table and enum by name (src/db/schema/*.ts is the single source of truth, one file per domain).
export { gameIdEnum, gameResultEnum, paintStageEnum, PAINT_STAGES, type PaintStage } from "./schema/enums";
export { dataPacks } from "./schema/packs";
export { collectionItems } from "./schema/collection";
export { armyLists } from "./schema/lists";
export { playedGames, gameEvents } from "./schema/play";

/** Owner tables: everything a JSON backup exports. `dataPacks` is deliberately not here. */
export const OWNER_TABLES = ["collection_items", "army_lists", "played_games", "game_events"] as const;
