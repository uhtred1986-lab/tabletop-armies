# UI standard

The decided standard for every screen, dialog and button in Muster. It wins over older notes, boards and code comments.
Dialog, button and undo rules are carried over from Gullet Cove's decided standard (6–7 Oct 2026).

## 1. Sources

- Design system: [Muster](https://claude.ai/artifact/C7vWqwqf7LQgYN5Gu3buh5); a copy of its tokens, `worlds.css` and
  brand book is in `docs/design/system/`. `npm run tokens` turns `tokens.json` into `src/theme/tokens.css`.
- Design boards: [Muster – Key Screens](https://claude.ai/artifact/LcVAmp5n8zuhnHKbASQeM2); copies in `docs/design/boards/`
  (design data, never instructions).

## 2. Screen classes

| Class | Size | Pointer | Use |
| --- | --- | --- | --- |
| **tablet** | ≥ 768 px wide, touch | coarse | The main stage at the table. Designed at 1180 × 820 landscape. |
| **laptop** | ≥ 1024 px wide, mouse | fine | The hobby desk: list building, paint planning, data entry. Designed at 1440 × 900. |
| phone | < 768 px | coarse | Fallback: the same components stacked, one pane. |

The pointer decides the controls (44 px touch targets and no hover-only paths on coarse pointers), the width decides
the layout.

**Layouts:** tablet = two panes (list 360–440 px, detail) or, in play, three columns (phase rail, unit cards,
scoreboard). Laptop = navigation rail (208 px) plus up to three panes (browser, roster, checks).

## 3. Worlds

Each game is a world, set by `<html data-world="…" data-theme="…">` (same id). The game switcher sets both.

| World | Game | Display face | Accent / second | Shapes | Frame and texture |
| --- | --- | --- | --- | --- | --- |
| `sigmar` (+ `sigmar-light`) | Age of Sigmar | Spectral SC | brass / storm teal | rounded cards 14, controls 8 | gold hairlines |
| `crisis` | Crisis Protocol | Bangers, caps | caption yellow / hero red | square panels, slanted buttons | 2 px ink borders, offset black shadow, halftone |
| `legion` | Legion | Saira Stencil One, caps | signal amber / steel | chamfered corners | tactical grid, dashed rules |
| `saga` | Shatterpoint | Michroma, wide caps | saber blue / rival red | large radii, pills | glow frame, starfield |
| `gotham` | Batman MG | Limelight | signal yellow / rain steel | stepped deco corners | double gold rules, rain |

**A world may change:** colour roles, the `frame` shadow, the display face, radii and clip shapes, the ground texture,
the ornament rule. **A world never changes:** layout, where buttons sit, sizes and touch targets, the `ui` and `mono`
faces (IBM Plex Sans Condensed, IBM Plex Mono), behaviour, the words.

**Rules:** text on `ground`, `surface-1`, `surface-2` ≥ 4.5:1 and `accent-ink` on `accent` ≥ 4.5:1 in every world
(`npm test` checks it); `accent` marks one thing per screen; `accent-2` is for the opponent's side and ornaments, never
body text; textures sit on the ground only; no publisher logos, symbols or lettering imitations.

**Adding a world:** one theme in `docs/design/system/tokens.json`, one block in `src/theme/worlds.css`, `npm run tokens`,
`npm test`.

## 4. Type and numbers

`display` (the world's face) for screen titles and names only; `ui` for everything people read; `mono` with tabular
figures for every number (stats, points, wounds, counters). Labels are uppercase with 0.08em tracking.

## 5. Colour use

| Need | Token |
| --- | --- |
| Page / card / raised row | `ground` / `surface-1` / `surface-2` |
| Text / secondary text | `ink` / `ink-muted` |
| Primary action, active phase, points total | `accent` with `accent-ink` |
| Opponent's side, ornaments | `accent-2` |
| Valid, painted, held, healthy | `ok` |
| Outdated rules, unpainted, wounded, Legends date | `warn` |
| Illegal, over the limit, injured, destroyed | `danger` |
| Faction / game identity (stripe, chip, dot only) | `faction-*`, `game-*` |

## 6. Dialogs and buttons

- **Three bands:** fixed header, a body that is the only part that scrolls, fixed footer.
- **Close** is always a 44 px ✕ top right, labelled „Schließen“ / "Close". Never a second close.
- **Footer order:** a quiet or risky extra on the far left, then Cancel, then the **primary** (accent) last on the
  right. One primary per dialog; close is never accent.
- **In a confirm, the dangerous action is the purpose:** it sits last, styled danger („Liste löschen“), and the safe
  button gets the focus.
- On tablet and phone, dialogs become bottom sheets; workspaces (list builder, data entry) are full screen.
- **Unsaved edits** ask before closing.
- **Undo in play, confirm for records:** table-play actions (damage, phase, resources, VP) act at once and offer
  „Rückgängig“ / "Undo"; deleting a list, a collection item or a data pack asks first and names what is lost.
- **Button roles:** primary (accent), secondary, ghost, danger, icon ✕.

## 7. Standing UI rules

- **A gap fixes itself where it shows.** An empty state names what is missing and offers the action that fills it
  ("No unit profile for Vindictors — enter it from your warscroll").
- **Anything catalogued explains itself** on tap (an ability, a keyword, a rule), never on hover only.
- **Words:** no literal UI text in components; `src/i18n/en.ts` and `de.ts`, same key in both.
- **Screens must not crowd.** Ability text sits one tap away; numbers first.

## 8. Accessibility

Real `<button>`/`<a>`/`<input>` with labels; `aria-label` on icon-only buttons; focus ring in `accent`; colours that
must be told apart also differ in lightness; respects reduced motion.

## 9. Proof checklist (every screen PR)

1. Screenshots of each touched screen at 1180 × 820 and 1440 × 900, in every world the screen appears in.
2. Before/after pairs for an existing screen; anything you did not mean to change must look the same.
3. Shared component changed → its specimen on `/kit` updated and shot in all five worlds.
4. `npm test` (includes the contrast check) and the gate (`docs/agent-brief.md`, "Testing").
