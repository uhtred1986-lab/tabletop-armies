// The barrel: every table and enum by name (src/db/schema/*.ts is the single source of truth, one file per domain).
export { gameIdEnum, gameResultEnum, paintStageEnum, PAINT_STAGES, type PaintStage } from "./schema/enums";
export { dataPacks, packAssets } from "./schema/packs";
export { blobDeletionQueue } from "./schema/blob-jobs";
export {
  collectionItems,
  storagePlaces,
  paintStages,
  collectionModels,
  paintHistory,
  photos,
} from "./schema/collection";
export { armyLists } from "./schema/lists";
export { playedGames, gameEvents } from "./schema/play";
export { collectionOverrides } from "./schema/overrides";
export { importRuns, importCandidates } from "./schema/imports";
export {
  campaigns,
  campaignGames,
  campaignRosterUnits,
  campaignUnitInjuries,
  campaignRenownEvents,
  campaignTerritories,
} from "./schema/campaigns";
export { offlineOperationReceipts } from "./schema/offline";

/** Owner backup tables. Catalogue packs, assets and import review copies stay private and are not exported. */
export const OWNER_TABLES = [
  "collection_items",
  "storage_places",
  "paint_stages",
  "collection_models",
  "paint_history",
  "photos",
  "army_lists",
  "played_games",
  "game_events",
  "collection_overrides",
  "campaigns",
  "campaign_games",
  "campaign_roster_units",
  "campaign_unit_injuries",
  "campaign_renown_events",
  "campaign_territories",
  "offline_operation_receipts",
] as const;
