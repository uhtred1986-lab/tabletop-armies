---
name: data-change
description: Use before changing Tabletop Armies' database schema (src/db/schema/*.ts, drizzle/ migrations), the backup format, the data-pack format or anything that writes the owner's stored data.
---

# Changing stored data

1. Read `docs/architecture/data-model.md` and `docs/architecture/platform.md`, "Deploys and the database".
2. Edit the domain file in `src/db/schema/`, export new names from the barrel `src/db/schema.ts`, then
   `npm run db:generate -- --name <what>`. Never hand-write or edit SQL in `drizzle/`; never `db:push`.
3. **Additive only:** new tables, new nullable columns or columns with a default, new enum values. Renames, drops and
   type changes need Heyhey's ask in the chat and a two-step plan (add, backfill, switch readers, drop later).
4. Only one migration may be in flight across open PRs: check `origin/main` and other open PRs first; regenerate on top
   of the newest `main` if another migration landed.
5. Extend `src/db/migrations.test.ts` (PGlite applies every migration to an empty database): the new column's default,
   its constraint, and the old rows' behaviour.
6. Never migrate production by hand. The merge to `main` deploys, makes a `pre-migrate-*` Neon branch and migrates.
7. A data repair or import script against production: a Neon branch `pre-<task>-<yyyymmdd>` first, named in the PR.
8. Packs (`data_packs`) are never part of a backup and never seeded from the repo.
9. Name the migration in the PR and the report.
