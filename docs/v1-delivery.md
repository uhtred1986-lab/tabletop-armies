# V1 implementation and review

This branch brings the M1–M10 workflows together for Heyhey's private companion app. It is a single PR; it does not merge to main or deploy production. Catalogue availability and owned inventory remain separate.

## Implemented workflows

| Area | First-version behavior |
| --- | --- |
| Collection and paint | Per-model inventory, named places, split-unit locations, bulk moves and undo, configurable paint stages, immutable paint history, private unit/model photos and owner JSON export. |
| Sources and imports | Local source adapters, explicit provenance and missing-field flags, candidate review/edit/reject, exact-match batch review, immutable publication, persistent owner corrections, private card viewer and approved external product-image references. |
| Lists | Module-driven editors and validators for all five games, ownership and paint warnings, manual rule settings, text export and explicit incomplete validation. New lists prefer a pack containing units; existing lists retain their selected version. |
| Table play | Both sides, phase/round progression, game-specific resources, unit trackers, dice/damage helpers, timer, notes, order deck and struggle helpers, event replay and undo. Players make game decisions. |
| Rules library | Search names, source text and figures; filter game, record type and special-mode family; expand readable excerpts, citations, requirements and suggested figures. One-Shots have their own source-backed family. Mode-specific automated play is deferred by the agreed lexicon-first scope. |
| Stats and campaigns | Completed-game statistics, history/replay, generic campaign ladder, manually configured Path to Glory, roster, renown events, injuries and territories. Missing paid rules remain unconfigured. |
| Offline | Owner-scoped IndexedDB snapshots/outbox, a static offline shell, cached field backgrounds, reload recovery, idempotent append/undo receipts and explicit conflict rebase or discard. Dynamic HTML/API responses are not cached by the service worker. |
| Responsive design | Existing world backgrounds, desktop rail, touch rail and phone tabs, shared header switcher, EN/DE, accessible controls and component specimens. |

## Source coverage and manual setup

The private verification database contains source-backed imports prepared during implementation; their contents are deliberately absent from Git. Import reports distinguish document dates, fetch dates, source revisions, parser coverage and missing fields. Public source data is not silently treated as complete or current merely because parsing succeeded.

The five-faction AoS import contains 270 units. The reviewed official comparison matched 217 unique unit names; 52 imported units retain explicit no-exact-official-row flags. Source-specific corrections, citations and zero-cost profiles were verified in the private database. This does not certify every unit, enhancement or season rule.

The special-mode library was exercised with 41 records and 18 source-backed figure suggestions. Required figures and suggestions are distinct, and availability comes from physical collection records. Counts describe the reviewed source set, not a claim that every future publication is covered.

The published private MCP five-PDF source set contains 236 distinct character/alter-ego or Grunt identities and 466 nonblank source cards. Identity uses the printed character-name/alter-ego pair; a shared alter ego across different titles remains the same identity for squad validation. Generic ability cards remain standalone sources, not extra figures. Shatterpoint contains 144 entries: 12 official Core Set profiles with 40 private card/stance images and 132 community names-only entries where official profiles are missing. Unknown roles, stats and release status remain visible; a names-only record cannot make a list fully validated. Source content and profile/image comparisons are reviewed separately from parser unit tests.

The three selected Legion/Batman starter products are marked for manual configuration, as Heyhey requested. Their empty contents do not infer figures, quantities or ownership. Collection provides an explicit action to enter owned units. No actual collection counts were supplied, so the application does not populate invented owned inventory.

## Verification evidence

The final PR records the exact integrated commit's gate/build result. Focused tests cover game validation, source adapters, review/publication races, authorization, migrations/backfill, owner-export boundaries, private asset routes, campaign persistence and event idempotency/replay.

Real browser journeys exercised collection moves and photos, a five-round AoS game, Shatterpoint resources/order/struggle, the other three games' tracker/undo/completion flows, and a three-game campaign. A database hand count of eight completed synthetic games (six wins, one draw, one loss) matched the stats screen; all 14 synthetic game rows and six test lists, including the final offline-hook regression journey, were then removed from the isolated branch. Offline verification included hard reload, multiple queued actions, queued undo, reconnect, a genuine stale-sequence conflict and explicit rebase/sync.

Private screenshot evidence is under `/workspace/scratch/tabletop-evidence/`: before/after hub, collection, lists, play and kit across all five worlds at 1440×900, 1180×820 touch and 390×844. Additional source-library and manual-starter captures are under `/workspace/scratch/reference-ui/` and `/workspace/scratch/collection-starters/`. The 75 final route captures returned 200, had no page errors or horizontal overflow, and used the expected background world/place. The first MCP desktop play image was retried after waiting for loaded content.

## Migration and rollout boundary

One additive migration, `0001_v1_foundation`, is included. It was exercised on PGlite and an isolated Neon child branch, `dev-all-milestones-v1-20261105` (`br-red-recipe-b9p3guih`), in project `long-mountain-10123121`. No production migration was run. Private media uses the connected private Blob store and an isolated development prefix.

The existing main-only Vercel deployment process takes a Neon backup before migrating and then runs the idempotent legacy collection backfill. Follow [platform setup](architecture/platform.md) and [private imports](importers.md) after a separately reviewed merge. The PR contains code and tests, not the verification database's publisher content or secrets.

Reusable improvements from this work include source-size limits, conservative PDF/BSData adapters, pack composition, review-race tests, an owner-export boundary test and shared UI specimens. These make the observed failure cases repeatable without embedding publisher fixtures.
