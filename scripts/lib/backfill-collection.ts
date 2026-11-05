/**
 * Idempotently materialize the first version of per-model collection data from the legacy collection row.
 * Legacy `storage` has names but no kind; its exact non-empty value is kept with a null kind for owner classification.
 */
export type BackfillQuery = (statement: string) => Promise<unknown>;
export type BackfillTransaction = (work: (query: BackfillQuery) => Promise<void>) => Promise<unknown>;

const seedPaintStages = `
  insert into paint_stages (key, label, sort_order)
  select seed.key, seed.label, seed.sort_order
  from (values
    ('unbuilt', 'Unbuilt', 0),
    ('built', 'Built', 1),
    ('primed', 'Primed', 2),
    ('base', 'Base', 3),
    ('shaded', 'Shaded', 4),
    ('detailed', 'Detailed', 5),
    ('based', 'Based', 6)
  ) as seed(key, label, sort_order)
  where not exists (select 1 from paint_stages)
`;

const createLegacyPlaces = `
  insert into storage_places (name)
  select distinct storage
  from collection_items
  where models_materialized_at is null and storage is not null and storage <> ''
  on conflict (name) do nothing
`;

const validateLegacyRows = `
  do $$
  declare
    negative_count bigint;
    missing_stage_count bigint;
  begin
    select count(*) into negative_count
    from collection_items
    where models_materialized_at is null and models < 0;

    select count(*) into missing_stage_count
    from collection_items as item
    left join paint_stages as stage on stage.key = item.paint_stage::text
    where item.models_materialized_at is null and item.models > 0 and stage.id is null;

    if negative_count > 0 or missing_stage_count > 0 then
      raise exception 'legacy collection backfill refused: % negative model counts, % missing paint stage definitions',
        negative_count, missing_stage_count;
    end if;
  end $$
`;

const materializeModels = `
  insert into collection_models (item_id, ordinal, place_id, paint_stage_id)
  select
    item.id,
    model.ordinal,
    place.id,
    stage.id
  from collection_items as item
  cross join lateral generate_series(1, greatest(item.models, 0)) as model(ordinal)
  join paint_stages as stage on stage.key = item.paint_stage::text
  left join storage_places as place on place.name = item.storage and item.storage <> ''
  where item.models_materialized_at is null
  on conflict (item_id, ordinal) do nothing
`;

const markMaterialized = `
  update collection_items
  set models_materialized_at = now()
  where models_materialized_at is null
`;

/** Atomically and once-only materialize legacy rows. Advisory locking serializes concurrent deploy attempts. */
export async function backfillLegacyCollection(transaction: BackfillTransaction): Promise<void> {
  await transaction(async (query) => {
    await query("select pg_advisory_xact_lock(1942254401, 1)");
    await query(seedPaintStages);
    await query(validateLegacyRows);
    await query(createLegacyPlaces);
    await query(materializeModels);
    await query(markMaterialized);
  });
}
