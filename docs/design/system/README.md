# Tabletop Armies

Tabletop Armies is a private companion for miniature-game collectors (Age of Sigmar, Crisis Protocol, Legion, Shatterpoint, Batman MG): it tracks the miniatures you own and how far each is painted, builds lists that are checked against the current Battle Profiles, and runs the game at the table. It is built for a tablet propped beside the board and a laptop at the hobby desk.

## Principles

1. **The table is the hero.** The default theme is dark (`ground`, `surface-1`) so the screen does not glare under a gaming lamp. Parchment (light) is for the hobby desk.
2. **Numbers first.** Stats, points and wounds are set in `mono` with tabular figures and read before any prose. Ability text sits one tap away.
3. **Faction colour is a signal.** Each faction has exactly one colour token (`faction-skaven`, `faction-stormcast`, `faction-gloomspite`, `faction-ossiarch`, `faction-seraphon`). Use it for a 4px stripe, a chip or a header rule, never as a large fill behind text.
4. **One accent.** `accent` (formerly `brass`) marks the single most important action or state on a screen: the primary button, the active phase, the points total. Two accent things on one screen is one too many.
5. **Borders, not shadows.** Separation comes from `line` hairlines and the step between `surface-1` and `surface-2`.
6. **Thumb-sized.** On tablet every tappable control is at least `space-12` (48px) tall.

## Voice

Short, plain and in the game's own terms. Use the rulebook's words for things (Battle Round, Hero Phase, Control, Ward) and say exactly what is wrong in validation messages.

- Good: "Over by 30 pts — remove 30 pts or raise the battle size."
- Good: "Sorceress moves to Legends on 1 June 2027."
- Avoid: "Oops! Something's not quite right with your list."

## Type

- `display`: screen titles and names only, in the world's face (Spectral SC, Bangers, Saira Stencil One, Michroma or Limelight; see Worlds).
- `ui` (IBM Plex Sans Condensed): everything people read — names (`title`), ability text (`body`), keywords (`label`, always uppercase).
- `mono` (IBM Plex Mono): every number — `stat` in the stat shield and counters, `numeric` for points and weapon tables.

All are Google Fonts; load them with one `<link>` (Spectral SC 600; Bangers; Saira Stencil One; Michroma; Limelight; IBM Plex Sans Condensed 400, 600; IBM Plex Mono 500, 600). Load `components/worlds.css` after `tokens.css`.

## Colour use

| Need | Token |
| --- | --- |
| Page / card / raised row | `ground` / `surface-1` / `surface-2` |
| Text / secondary text | `ink` / `ink-muted` |
| Primary action, active phase, points total | `accent` with `accent-ink` text |
| Opponent's side, ornaments | `accent-2` |
| Valid, painted, held | `ok` |
| Legends date, unpainted, outdated points | `warn` |
| Illegal list, over points, destroyed | `danger` |
| Faction identity | the faction's own token |

Text on `ground`, `surface-1` and `surface-2` meets 4.5:1 in every world. `warn` and `ok` text is used only at `label` size or larger on `surface-1`.

## Faction art

Each faction header carries original painterly key art (rat horde in a ruined sewer-city; lightning knights; moon goblins on bouncing fungus-beasts; bone-construct phalanx; lizard warriors before a star-lit pyramid). The art is generated for this app and carries no Games Workshop artwork, logos or trademarks. Rules for use:

- Only in faction headers and the collection overview tiles, cropped wide (16:9 or wider).
- Always under a `ground` scrim from the text side so the title keeps 4.5:1.
- Never behind stat blocks, lists or ability text.

## Scene plates

Behind every screen sits a painted plate of the current world: hall, table and field, one dark plate each, under a veil
of the world's `ground`. Calm on the left where panels sit, detail on the right. Prompts: `scripts/generate-backgrounds.mts`;
processing: `scripts/process-backgrounds.mts`; rules: `docs/ui-standard.md` §3.

## Worlds: one app, five looks

Each game is a **world**: a costume the whole app wears while you are in that game. `<html data-world="…" data-theme="…">` carries it (the theme id and the world id are the same word). The game switcher changes both.

| World | Game | Mood | Display face | Accent / second | Shapes | Frame and texture |
| --- | --- | --- | --- | --- | --- | --- |
| `sigmar` | Age of Sigmar | Mythic war table, gilded ledger | Spectral SC | brass `#c9a24c` / storm teal | rounded cards (14px), soft controls | gold hairline rules; plain ground |
| `crisis` | Crisis Protocol | Comic-book splash page | Bangers, caps | caption yellow `#f5c518` / hero red | square panels, slanted buttons | 2px ink borders, offset black shadow, halftone dots |
| `legion` | Legion | Field-command HUD | Saira Stencil One, caps | signal amber `#e8a33c` / steel | chamfered corners, no radius | tactical grid, dashed amber rules |
| `saga` | Shatterpoint | Cinematic duel in deep space | Michroma, wide caps | saber blue `#5cc8ff` / rival red | large radii, pill buttons | soft glow frame, starfield |
| `gotham` | Batman MG | Rain-soaked art-deco noir | Limelight | signal yellow `#f2c230` / rain steel | stepped deco corners | double gold rules, rain streaks |

`sigmar-light` is the hobby-desk (light) version of Mortal Realms; the other worlds are dark-only for now (the token format holds 8 themes).

**What a world may change:** the colour roles (`ground`, `surface-*`, `line`, `ink*`, `accent`, `accent-2`, status colours), the `frame` shadow, the display face, radii and clip shapes, the ground texture and the ornament rule. All of these live in `tokens.json` (colours, `frame`) and `components/worlds.css` (face, shape, texture), and components read them through `.w-display`, `.w-card`, `.w-btn`, `.w-ground` and `.w-rule`.

**What a world never changes:** the layout, where buttons sit, sizes and 44px touch targets, the `ui` and `mono` faces (IBM Plex Sans Condensed, IBM Plex Mono), behaviour and the words on screen. A world is a costume, not a different app.

**Rules for every world:**
- Text on `ground`, `surface-1` and `surface-2` is 4.5:1 or better; `accent-ink` on `accent` likewise (checked for all six themes).
- `accent` marks one thing per screen; `accent-2` is for the opponent's side and ornaments, never body text.
- Textures sit on the ground only, never behind text blocks or stat tables.
- No publisher logos, trademarked symbols or lettering imitations: worlds evoke a genre (comic splash, field HUD, space opera, deco noir), they do not copy a brand.
- Adding a world = one theme in `tokens.json` + one block in `worlds.css` + a contrast check.

Inside a world each game keeps its own vocabulary (Stamina and Power in Crisis Protocol, Force and Struggle in Shatterpoint, Rep and $ in Batman MG) and its trackers, built from the same widgets: counter, pip track, damage-state flip, card deck, phase rail. `game-*` tokens still mark each game in the cross-game hub.

## Iconography

Lucide line icons at 20px, 1.5px stroke, coloured `ink` or `ink-muted`. Dice faces and the four stat glyphs (Move, Health, Save, Control) are the only custom icons.

## Layouts

- **Tablet (landscape, 1180 × 820):** two panes — list on the left (360px), detail on the right. Table play uses three columns: phase rail, unit cards, scoreboard.
- **Laptop (1440 wide):** left navigation rail, up to three panes; list building shows the unit browser, the roster and the validation panel side by side.
- **Phone:** one pane, the same components stacked; not the primary target.

## Components

Stat shield, Unit card, Paint stage, Points bar, Validation item, Phase rail, Faction chip, Wound tracker, Game switcher and World sheet. Each has a live preview below; World sheet shows the same card in all five worlds.
