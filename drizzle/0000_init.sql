CREATE TYPE "public"."game_id" AS ENUM('aos', 'mcp', 'legion', 'shatterpoint', 'bmg');--> statement-breakpoint
CREATE TYPE "public"."game_result" AS ENUM('win', 'loss', 'draw');--> statement-breakpoint
CREATE TYPE "public"."paint_stage" AS ENUM('unbuilt', 'built', 'primed', 'base', 'shaded', 'detailed', 'based');--> statement-breakpoint
CREATE TABLE "collection_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" "game_id" NOT NULL,
	"faction_name" text,
	"unit_name" text NOT NULL,
	"unit_id" text,
	"models" integer DEFAULT 1 NOT NULL,
	"loadout" text,
	"storage" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"paint_stage" "paint_stage" DEFAULT 'unbuilt' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "army_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" "game_id" NOT NULL,
	"name" text NOT NULL,
	"pack_id" integer,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_packs" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" "game_id" NOT NULL,
	"source" text NOT NULL,
	"source_date" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"played_game_id" integer NOT NULL,
	"seq" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "played_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" "game_id" NOT NULL,
	"list_ids" integer[] DEFAULT '{}' NOT NULL,
	"opponent" text,
	"played_on" date NOT NULL,
	"result" "game_result",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "army_lists" ADD CONSTRAINT "army_lists_pack_id_data_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."data_packs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_played_game_id_played_games_id_fk" FOREIGN KEY ("played_game_id") REFERENCES "public"."played_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_items_game_idx" ON "collection_items" USING btree ("game_id","unit_name");--> statement-breakpoint
CREATE INDEX "army_lists_game_idx" ON "army_lists" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "data_packs_game_idx" ON "data_packs" USING btree ("game_id","source_date");--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_game_seq_uq" ON "game_events" USING btree ("played_game_id","seq");--> statement-breakpoint
CREATE INDEX "played_games_game_idx" ON "played_games" USING btree ("game_id","played_on");