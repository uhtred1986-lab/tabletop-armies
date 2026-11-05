CREATE TABLE "blob_deletion_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"blob_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	CONSTRAINT "blob_deletion_queue_attempts_check" CHECK ("blob_deletion_queue"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"played_game_id" integer,
	"sort_order" integer NOT NULL,
	"notes" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_games_sort_order_nonnegative_check" CHECK ("campaign_games"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_renown_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"roster_unit_id" integer NOT NULL,
	"renown_delta" integer NOT NULL,
	"occurred_on" date NOT NULL,
	"played_game_id" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_renown_events_nonzero_check" CHECK ("campaign_renown_events"."renown_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_roster_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"collection_item_id" integer,
	"unit_id" text,
	"unit_name" text NOT NULL,
	"faction_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_territories" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_name" text,
	"acquired_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_unit_injuries" (
	"id" serial PRIMARY KEY NOT NULL,
	"roster_unit_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"incurred_on" date NOT NULL,
	"incurred_game_id" integer,
	"recovered_on" date,
	"is_permanent" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_unit_injuries_recovery_check" CHECK ("campaign_unit_injuries"."recovered_on" is null or "campaign_unit_injuries"."recovered_on" >= "campaign_unit_injuries"."incurred_on")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" "game_id" NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_kind_check" CHECK ("campaigns"."kind" in ('generic', 'path_to_glory'))
);
--> statement-breakpoint
CREATE TABLE "collection_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"item_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"label" text,
	"place_id" integer,
	"paint_stage_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_models_model_key_unique" UNIQUE("model_key"),
	CONSTRAINT "collection_models_ordinal_positive_check" CHECK ("collection_models"."ordinal" > 0)
);
--> statement-breakpoint
CREATE TABLE "paint_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer,
	"model_key" uuid NOT NULL,
	"game_id" "game_id" NOT NULL,
	"unit_name" text NOT NULL,
	"model_ordinal" integer NOT NULL,
	"model_label" text,
	"from_stage_id" integer,
	"from_stage_key" text,
	"from_stage_label" text,
	"from_completed" boolean NOT NULL,
	"to_stage_id" integer,
	"to_stage_key" text NOT NULL,
	"to_stage_label" text NOT NULL,
	"to_completed" boolean NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "paint_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paint_stages_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"blob_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"item_id" integer,
	"model_id" integer,
	"paint_stage_key" text,
	"paint_stage_label" text,
	"taken_at" timestamp with time zone,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_blob_key_unique" UNIQUE("blob_key"),
	CONSTRAINT "photos_exactly_one_owner_check" CHECK (("photos"."item_id" is null) <> ("photos"."model_id" is null)),
	CONSTRAINT "photos_byte_size_positive_check" CHECK ("photos"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "storage_places" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_places_name_unique" UNIQUE("name"),
	CONSTRAINT "storage_places_kind_check" CHECK ("storage_places"."kind" is null or "storage_places"."kind" in ('case', 'box', 'shelf', 'away'))
);
--> statement-breakpoint
CREATE TABLE "import_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"entity_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"proposed" jsonb NOT NULL,
	"match_target_id" text,
	"match_confidence" numeric(4, 3),
	"review_state" text DEFAULT 'pending' NOT NULL,
	"reviewer_note" text,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "import_candidates_confidence_check" CHECK ("import_candidates"."match_confidence" is null or ("import_candidates"."match_confidence" >= 0 and "import_candidates"."match_confidence" <= 1)),
	CONSTRAINT "import_candidates_review_state_check" CHECK ("import_candidates"."review_state" in ('pending', 'accepted', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" "game_id" NOT NULL,
	"source_kind" text NOT NULL,
	"source_url" text,
	"source_revision" text,
	"source_date" text,
	"fetched_at" timestamp with time zone,
	"status" text DEFAULT 'review' NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_runs_status_check" CHECK ("import_runs"."status" in ('review', 'accepted', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "offline_operation_receipts" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"played_game_id" integer NOT NULL,
	"operation_kind" text NOT NULL,
	"expected_seq" integer NOT NULL,
	"payload_hash" text NOT NULL,
	"outcome" text NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"event_id" bigint,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_operation_receipts_kind_check" CHECK ("offline_operation_receipts"."operation_kind" in ('append', 'undo')),
	CONSTRAINT "offline_operation_receipts_outcome_check" CHECK ("offline_operation_receipts"."outcome" in ('accepted', 'conflict', 'rejected')),
	CONSTRAINT "offline_operation_receipts_expected_seq_check" CHECK ("offline_operation_receipts"."expected_seq" >= 0),
	CONSTRAINT "offline_operation_receipts_payload_hash_check" CHECK (length("offline_operation_receipts"."payload_hash") > 0)
);
--> statement-breakpoint
CREATE TABLE "collection_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" "game_id" NOT NULL,
	"target_id" text NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_overrides_target_nonempty_check" CHECK (length(trim("collection_overrides"."target_id")) > 0),
	CONSTRAINT "collection_overrides_field_nonempty_check" CHECK (length(trim("collection_overrides"."field")) > 0)
);
--> statement-breakpoint
CREATE TABLE "pack_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"pack_id" integer NOT NULL,
	"unit_id" text NOT NULL,
	"kind" text NOT NULL,
	"blob_key" text NOT NULL,
	"source_url" text NOT NULL,
	"source_name" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_assets_kind_check" CHECK ("pack_assets"."kind" in ('card', 'token', 'model_reference'))
);
--> statement-breakpoint
ALTER TABLE "collection_items" ADD COLUMN "models_materialized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "operation_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_games" ADD CONSTRAINT "campaign_games_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_games" ADD CONSTRAINT "campaign_games_played_game_id_played_games_id_fk" FOREIGN KEY ("played_game_id") REFERENCES "public"."played_games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_renown_events" ADD CONSTRAINT "campaign_renown_events_roster_unit_id_campaign_roster_units_id_fk" FOREIGN KEY ("roster_unit_id") REFERENCES "public"."campaign_roster_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_renown_events" ADD CONSTRAINT "campaign_renown_events_played_game_id_played_games_id_fk" FOREIGN KEY ("played_game_id") REFERENCES "public"."played_games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_roster_units" ADD CONSTRAINT "campaign_roster_units_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_roster_units" ADD CONSTRAINT "campaign_roster_units_collection_item_id_collection_items_id_fk" FOREIGN KEY ("collection_item_id") REFERENCES "public"."collection_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_territories" ADD CONSTRAINT "campaign_territories_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_unit_injuries" ADD CONSTRAINT "campaign_unit_injuries_roster_unit_id_campaign_roster_units_id_fk" FOREIGN KEY ("roster_unit_id") REFERENCES "public"."campaign_roster_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_unit_injuries" ADD CONSTRAINT "campaign_unit_injuries_incurred_game_id_played_games_id_fk" FOREIGN KEY ("incurred_game_id") REFERENCES "public"."played_games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_models" ADD CONSTRAINT "collection_models_item_id_collection_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."collection_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_models" ADD CONSTRAINT "collection_models_place_id_storage_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."storage_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_models" ADD CONSTRAINT "collection_models_paint_stage_id_paint_stages_id_fk" FOREIGN KEY ("paint_stage_id") REFERENCES "public"."paint_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paint_history" ADD CONSTRAINT "paint_history_model_id_collection_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."collection_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paint_history" ADD CONSTRAINT "paint_history_from_stage_id_paint_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."paint_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paint_history" ADD CONSTRAINT "paint_history_to_stage_id_paint_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."paint_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_item_id_collection_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."collection_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_model_id_collection_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."collection_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_candidates" ADD CONSTRAINT "import_candidates_run_id_import_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."import_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_operation_receipts" ADD CONSTRAINT "offline_operation_receipts_played_game_id_played_games_id_fk" FOREIGN KEY ("played_game_id") REFERENCES "public"."played_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_operation_receipts" ADD CONSTRAINT "offline_operation_receipts_event_id_game_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."game_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_assets" ADD CONSTRAINT "pack_assets_pack_id_data_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."data_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blob_deletion_queue_blob_key_uq" ON "blob_deletion_queue" USING btree ("blob_key");--> statement-breakpoint
CREATE INDEX "blob_deletion_queue_queued_idx" ON "blob_deletion_queue" USING btree ("queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_games_campaign_order_uq" ON "campaign_games" USING btree ("campaign_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_games_campaign_game_uq" ON "campaign_games" USING btree ("campaign_id","played_game_id");--> statement-breakpoint
CREATE INDEX "campaign_renown_events_unit_date_idx" ON "campaign_renown_events" USING btree ("roster_unit_id","occurred_on");--> statement-breakpoint
CREATE INDEX "campaign_roster_units_campaign_order_idx" ON "campaign_roster_units" USING btree ("campaign_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_territories_campaign_name_uq" ON "campaign_territories" USING btree ("campaign_id","name");--> statement-breakpoint
CREATE INDEX "campaign_territories_campaign_idx" ON "campaign_territories" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_unit_injuries_unit_idx" ON "campaign_unit_injuries" USING btree ("roster_unit_id","incurred_on");--> statement-breakpoint
CREATE INDEX "campaigns_game_created_idx" ON "campaigns" USING btree ("game_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_models_item_ordinal_uq" ON "collection_models" USING btree ("item_id","ordinal");--> statement-breakpoint
CREATE INDEX "collection_models_place_idx" ON "collection_models" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "collection_models_paint_stage_idx" ON "collection_models" USING btree ("paint_stage_id");--> statement-breakpoint
CREATE INDEX "paint_history_model_changed_idx" ON "paint_history" USING btree ("model_key","changed_at");--> statement-breakpoint
CREATE INDEX "paint_history_game_changed_idx" ON "paint_history" USING btree ("game_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "paint_stages_sort_order_uq" ON "paint_stages" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "photos_item_idx" ON "photos" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "photos_model_idx" ON "photos" USING btree ("model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_candidates_run_entity_source_uq" ON "import_candidates" USING btree ("run_id","entity_kind","source_id");--> statement-breakpoint
CREATE INDEX "import_candidates_run_state_idx" ON "import_candidates" USING btree ("run_id","review_state");--> statement-breakpoint
CREATE INDEX "import_runs_game_created_idx" ON "import_runs" USING btree ("game_id","created_at");--> statement-breakpoint
CREATE INDEX "offline_operation_receipts_game_idx" ON "offline_operation_receipts" USING btree ("played_game_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_overrides_target_field_uq" ON "collection_overrides" USING btree ("game_id","target_id","field");--> statement-breakpoint
CREATE INDEX "collection_overrides_game_idx" ON "collection_overrides" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pack_assets_pack_blob_key_uq" ON "pack_assets" USING btree ("pack_id","blob_key");--> statement-breakpoint
CREATE INDEX "pack_assets_blob_key_idx" ON "pack_assets" USING btree ("blob_key");--> statement-breakpoint
CREATE INDEX "pack_assets_pack_idx" ON "pack_assets" USING btree ("pack_id");--> statement-breakpoint
CREATE INDEX "pack_assets_pack_unit_kind_idx" ON "pack_assets" USING btree ("pack_id","unit_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_operation_id_uq" ON "game_events" USING btree ("operation_id");