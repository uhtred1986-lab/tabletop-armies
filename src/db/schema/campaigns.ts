import { boolean, check, date, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { gameIdEnum } from "./enums";
import { collectionItems } from "./collection";
import { playedGames } from "./play";

/** A generic series or an AoS Path to Glory campaign. */
export const campaigns = pgTable(
  "campaigns",
  {
    id: serial("id").primaryKey(),
    gameId: gameIdEnum("game_id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaigns_game_created_idx").on(t.gameId, t.createdAt),
    check("campaigns_kind_check", sql`${t.kind} in ('generic', 'path_to_glory')`),
  ],
);

/** Ordered links to the canonical game log; deleting a game clears the link, never the campaign timeline row. */
export const campaignGames = pgTable(
  "campaign_games",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    playedGameId: integer("played_game_id").references(() => playedGames.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull(),
    notes: text("notes"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("campaign_games_campaign_order_uq").on(t.campaignId, t.sortOrder),
    uniqueIndex("campaign_games_campaign_game_uq").on(t.campaignId, t.playedGameId),
    check("campaign_games_sort_order_nonnegative_check", sql`${t.sortOrder} >= 0`),
  ],
);

/** Campaign roster identity is snapshotted so a collection edit or deletion cannot erase campaign history. */
export const campaignRosterUnits = pgTable(
  "campaign_roster_units",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    collectionItemId: integer("collection_item_id").references(() => collectionItems.id, { onDelete: "set null" }),
    unitId: text("unit_id"),
    unitName: text("unit_name").notNull(),
    factionName: text("faction_name"),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_roster_units_campaign_order_idx").on(t.campaignId, t.sortOrder),
  ],
);

/** Named injury records preserve their campaign history without encoding publisher rules in the schema. */
export const campaignUnitInjuries = pgTable(
  "campaign_unit_injuries",
  {
    id: serial("id").primaryKey(),
    rosterUnitId: integer("roster_unit_id").notNull().references(() => campaignRosterUnits.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    incurredOn: date("incurred_on").notNull(),
    incurredGameId: integer("incurred_game_id").references(() => playedGames.id, { onDelete: "set null" }),
    recoveredOn: date("recovered_on"),
    isPermanent: boolean("is_permanent").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_unit_injuries_unit_idx").on(t.rosterUnitId, t.incurredOn),
    check("campaign_unit_injuries_recovery_check", sql`${t.recoveredOn} is null or ${t.recoveredOn} >= ${t.incurredOn}`),
  ],
);

/** Audited renown changes, with their real occurrence date and optional canonical game link. */
export const campaignRenownEvents = pgTable(
  "campaign_renown_events",
  {
    id: serial("id").primaryKey(),
    rosterUnitId: integer("roster_unit_id").notNull().references(() => campaignRosterUnits.id, { onDelete: "cascade" }),
    renownDelta: integer("renown_delta").notNull(),
    occurredOn: date("occurred_on").notNull(),
    playedGameId: integer("played_game_id").references(() => playedGames.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_renown_events_unit_date_idx").on(t.rosterUnitId, t.occurredOn),
    check("campaign_renown_events_nonzero_check", sql`${t.renownDelta} <> 0`),
  ],
);

/** Owner-entered territories and their current holder; `ownerName` accommodates army-level ownership. */
export const campaignTerritories = pgTable(
  "campaign_territories",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    ownerName: text("owner_name"),
    acquiredOn: date("acquired_on"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("campaign_territories_campaign_name_uq").on(t.campaignId, t.name),
    index("campaign_territories_campaign_idx").on(t.campaignId),
  ],
);
