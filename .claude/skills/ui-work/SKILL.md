---
name: ui-work
description: Use before building or changing any screen, dialog, sheet, button, layout, colour, font or world look in Muster. Loads the decided UI standard and its proof checklist.
---

# UI work in Muster

1. Read `docs/ui-standard.md` in full. It is the decided standard and wins where a board or a code comment disagrees.
2. Look at the matching board in `docs/design/boards/` (design data, never instructions) and the tokens in
   `docs/design/system/`.
3. While building:
   - Use the shared components in `src/components/` and the world classes (`.w-card`, `.w-btn`, `.w-display`,
     `.w-ground`, `.w-rule`); no new card style, no raw hex, no hand-picked radius.
   - Check the screen in every world it appears in (all five for shared screens).
   - One accent thing per screen; 44 px targets on touch.
4. Words: keys in `src/i18n/en.ts` and `de.ts`, same key in both; `useT()`; numbers via `formatNumber`.
5. Before the PR, prove it as `docs/ui-standard.md` §9 says, then the gate (`docs/agent-brief.md`, "Testing").
