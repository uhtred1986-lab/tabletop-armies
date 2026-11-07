# Private catalogue import workflow

Importers run locally or from the signed-in `/data` screen. They stage private, owner-review candidates; only an explicit publish creates a replaceable `data_packs` row. Publisher material and intermediate files stay under the git-ignored `data/` directory and are never fixtures or source files.

## Source policy

Put only URLs you intend to inspect in `data/sources.json`. Each entry needs an HTTPS `url` and a purpose (`catalogue`, `modes`, `scenario`, `product`, `card`, or `token`); game imports also need `gameId`. Before network fetches, record a `termsReview` URL and review date. Optional `sourceDate` is the verified document or rules date, distinct from fetch/import timestamps. Do not fill it with the download date. Mode/scenario PDFs may add a printed `documentTitle` and explicit `recordCandidates` with reviewed names, kinds, optional exact page ranges, tags, and mode type.

The fetch gate requires an allowlisted publisher/CDN host, an explicit URL-list entry, a readable robots policy that allows the requested path, and a recorded terms review. Redirects are rejected; requests are spaced per host and retry only a bounded number of times. Downloads are capped at 120 MiB. The importer does not evade access controls or infer authority from a successful HTTP response.

Atomic Mass Games terms prohibit bots and scrapers to the website. Therefore automatic AMG HTML crawling is disabled. The importer accepts owner-listed direct static PDF/image URLs after the source checks, and local owner-downloaded files placed inside `data/amg/manual/`. The manual-file fallback does not bypass the website policy: review terms before obtaining the source. Warhammer pages that block robots or whose terms prohibit copying are not bypassed. The official-product image workflow stores only a publisher-hosted image reference and shows it in `/data` after the owner accepts the candidate; it does not copy the image into Blob.

## Age of Sigmar

Use a local BSData checkout. Pass the `.gst` and every relevant faction/library `.cat` file to the graph-aware importer; linked and shared entries are resolved through the game-system file and diagnostics are retained.

```sh
npx tsx scripts/importers/aos-bsdata-cli.ts \
  --gst data/bsdata/age-of-sigmar.gst \
  --cat data/bsdata/Skaven.cat \
  --cat data/bsdata/StormcastEternals.cat
```

The command emits `data/import-drafts/*.pack.json`; it never writes to Neon. Run each faction against the same chosen BSData commit and retain that revision. `aos-battle-profiles.ts` conservatively recognizes text rows as points candidates but flags every row for owner verification. Join the rows to a local AoS draft with a PDF URL that you verified:

```sh
npx tsx scripts/importers/aos-battle-profiles-cli.ts \
  --pack data/import-drafts/aos-pack.json \
  --pdf data/official/battle-profiles.pdf \
  --source-url https://www.warhammer-community.com/example-battle-profiles.pdf
```

Pass `--source-date YYYY-MM` only if the document prints that date. Exact names are suggestions and are not auto-accepted. Unsupported table layouts stay unmatched. Unit size is preserved as a reviewed points-profile size and is not silently mapped to a minimum unit size. Enter unavailable Spearhead, Path to Glory, formation, or paid rules in a manual private pack and leave their validation sections explicitly unconfigured until reviewed.

## Age of Sigmar Spearhead armies

Ready-made Spearhead armies live in `catalogue.spearheads` of a private AoS pack (`aosSpearheadSchema`, `src/games/aos/schema.ts`). Their names and contents come only from Heyhey's own boxes and scans; the repo holds none of them, and every example here is invented. Packs without spearheads stay valid (`spearheads` defaults to `[]`).

Each spearhead carries an id, name, optional `factionId`, a `source` (`title`, optional `printedDate` only if the source prints one, `kind`: `owner-scan` or `manual`), `units` (each: optional `unitId` linking a catalogue unit, `name`, `modelCount`, optional `isGeneral` and `notes`), record arrays `battleTraits`, `regimentAbilities` and `enhancements`, and `sections`, one status per section: `configured`, `incomplete` or `unconfigured` (the default). Nothing is inferred: a section stays unconfigured until the owner enters it, and an unlinked unit stays unlinked until the owner sets its `unitId`.

Write a short owner file in the ignored `data/` folder, for example `data/spearheads.input.json`:

```json
{
  "packId": "aos-spearheads-owner",
  "revision": "owner-2026-11",
  "spearheads": [
    { "name": "Ember Wardens", "factionId": "test-faction",
      "source": { "title": "Own scan of the box sheet", "kind": "owner-scan" },
      "units": [
        { "unitId": "test-hero", "name": "Test Hero", "modelCount": 1, "isGeneral": true },
        { "name": "Test Trooper", "modelCount": 10 }
      ] },
    { "id": "ash-riders", "name": "Ash Riders" }
  ]
}
```

Then run:

```sh
npx tsx scripts/importers/spearhead-template-cli.ts --input data/spearheads.input.json \
  [--pack data/import-drafts/aos-pack.json] [--out data/import-drafts/my.spearheads.pack.json]
```

It writes a review bundle to `data/import-drafts/<packId>.spearheads.pack.json` (input and output must stay inside `data/`). Ids default to a slug of the name. A section the owner filled starts `incomplete`; an empty one `unconfigured`; only an explicit `"sections": { "units": "configured" }` in the input (after checking against the box) marks a section configured. With `--pack`, unit ids not found in that AoS pack are reported as warnings; links are never guessed from names. Lists check composition against the units in the *same* pack, so compose the spearhead draft with the unit pack (`compose-packs-cli.ts`) before staging it in `/data`, where each spearhead is a `spearhead` review candidate.

In the list builder (AoS, mode Spearhead) the panel "Start from a ready-made Spearhead" lists the selected pack's spearheads with faction, unit count and a configured/incomplete badge; choosing one fills the entries. A pack without spearheads shows an empty state that points to `/data`.

## Official Warhammer model image candidates

Create a current local pack first, then put one product URL per entry in `data/sources.json` with `purpose: "product"` and the target `gameId`. Run:

```sh
npx tsx scripts/importers/official-product-cli.ts --pack data/current-pack.json
```

This extracts product/image URL candidates and exact/fuzzy name-match suggestions. It does not download image bytes. Stage the generated JSON in `/data`, review the match explicitly, and the external image becomes visible only for accepted candidates. Ambiguous candidates stay unlinked until a specific catalogue unit is selected.

## Atomic Mass Games

List only the official page or direct static media URL you have reviewed. `fetchAmgSources` downloads listed static cards/tokens and direct rules PDFs to `data/amg/raw/`; HTML pages and local downloaded PDFs can be parsed from an owner-created manifest. Product pages use `.reveal-cards` image pairs where available. Repeated image URLs and SVG theme ornaments are ignored. Front/back pairing and names from filenames remain review proposals; role icons and rules fields are not inferred from art filenames.

```sh
npx tsx scripts/importers/amg-import.ts fetch
npx tsx scripts/importers/amg-import.ts parse data/amg/raw/manifest.json
```

When an owner-listed card PDF is to be uploaded to private Blob as part of parsing, use the Node server condition so the shared server-only Blob helper is available:

```sh
node --conditions=react-server --import tsx scripts/importers/amg-import.ts parse data/amg/raw/manifest.json --upload-assets
```

Asset-bearing output files use a `-with-assets.pack.json` suffix, so a later text-only parse cannot overwrite their private asset references.

MCP stat card PDFs are rendered as separate healthy/injured card-side images using the current reviewed print layout, with visible numbers retained by position. Icon numbers remain unlabeled and unconfigured; no complete stats profile is claimed. Other PDFs produce source text and page-level records for review; source text is not interpreted as game rules. Rule PDFs use explicit owner-reviewed candidate names and retain extracted page sections/source references. Unsupported pages and missing text are called out in the report. Do not treat an assembly PDF as a card PDF.

MCP, Shatterpoint, Legion and Batman products/cards may have incomplete source coverage. Coverage counts in the draft report count listed sources and parser outputs, not all content in a game. The app must not label an incomplete parser result as a full catalogue. Legion starter-box content is limited to the owner-selected SWQ19 and SWQ28 products; Batman scope is KSTBMG019. Rules that are unavailable without payment are entered manually and marked unconfigured until the owner supplies them. Companion play does not automatically enforce those rules.

## Review and publish

Open `/data`, upload a generated bundle or raw `CataloguePack` JSON no larger than 3 MiB, review candidate JSON, choose any unit match explicitly, and accept or reject each row. The bound leaves room for multipart form overhead within Vercel's 4.5 MB request limit. For a bundle that exceeds the limit, upload its raw `pack` object to avoid duplicating candidate payloads. Larger distinct catalogues must be split into independently reviewable packs; do not raise this limit for a deployment. Accepted card/token assets require a selected unit. Explicit batch review supports plain candidates and exact, confidence-1 point/card matches; ambiguous matches remain individual decisions. Review editors are mounted on first expansion so large catalogues do not create thousands of hidden unit selectors. The page validates the resulting game-specific `CataloguePack` schema before insert. Corrections live in `collection_overrides`, are keyed by stable catalogue ID and field path, and are reapplied to future packs. Published packs are immutable versions; collection rows are never rewritten by publishing.

The collection-link panel offers exact and fuzzy name matches as suggestions only. The owner chooses a unit and saves before `collection_items.unit_id` changes. The card viewer compares each published unit's parsed fields and linked private card/token images; image bytes are served through an authenticated no-store route. Shared catalogue references resolve by pack asset ID, so a catalogue record can point to an asset even where the storage row has one primary unit association.

The database import path takes the shared per-key Blob advisory lock inside the same transaction as `pack_assets` insertion and verifies the private object before retaining a reference. If the object was removed before publishing, the transaction fails without creating a dangling reference; re-upload the image and retry. Blob deletion is reference-safe across collection photos and pack assets.

## Identity mapping and manual starter products

Verified filename-to-name mappings are private inputs, not code. For saved Shatterpoint product pages, pass `--identity-map data/amg/raw/identity-map.json` to the AMG parser; without a map it preserves filename-derived names as unconfirmed. Stance images remain cards, never additional figures. Community names-only catalogues must retain community provenance and leave unknown official identity, release status, roles and stats unconfigured.

Owner-selected starter products use `catalogue.starterBoxes` (and optional `constraints.starterSelections` metadata). Review them as `starter-box` candidates. Empty unverified contents are displayed in Collection with an explicit manual-entry action; selecting a box never creates owned models. Starter-only and mode-only packs do not replace a unit-bearing pack as the default for a new list.

Owner JSON exports exclude packs, private catalogue assets, import runs and proposed review candidates. The latter can contain full publisher material even before publication; preserve private source files separately when needed.

Generic source cards can be reviewed as **standalone source cards** instead of being falsely attached to a figure. The explicit review target is `card:<that-card-id>` and is accepted only for the same accepted card record. `pack_assets.unit_id` stores this reserved scoped association for standalone assets; it is not a catalogue unit or an owned model. The card viewer renders these separately, with source text and full-resolution private image links. Unit-linked stance images are merged with front/back references without inferring extra figures.
