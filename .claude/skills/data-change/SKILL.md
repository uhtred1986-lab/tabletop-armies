---
name: data-change
description: Use before changing Muster's IndexedDB schema (src/core/db.ts), the backup format, the data-pack format or anything that reads or writes the owner's stored data.
---

# Changing stored data

1. Read `docs/architecture/data-model.md`.
2. Schema changes are a **new** `db.version(n)` block with an `upgrade()` that migrates existing rows. Never edit or
   delete an earlier version block; additive only.
3. Only one version bump may be in flight across open PRs: check `origin/main` and other open PRs first.
4. Add a test that opens a database at the previous version with sample rows, upgrades it and checks every row
   (fake-indexeddb in Vitest).
5. Backup format: export must round-trip (export → import into an empty db → export is identical). Packs are never
   part of a backup.
6. Name the version bump in the PR and the report.
