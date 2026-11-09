// Every label a game module shows must exist in the strings (CLAUDE.md, "Screens and words"); a missing key shows up
// on screen as the raw key, e.g. "list.field.squads".
import { describe, expect, it } from "vitest";
import { games } from "./registry";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";
import type { ListFieldDefinition } from "./types";

const keysOf = (fields: readonly ListFieldDefinition[]): string[] =>
  fields.flatMap((f) => [f.labelKey, ...(f.choices ?? []).map((c) => c.labelKey), ...keysOf(f.itemFields ?? [])]);

describe("game module labels", () => {
  for (const game of games) {
    it(`${game.id}: every label has an English and a German string`, () => {
      const variants = game.listBuilder?.variants ?? [];
      const keys = new Set<string>([
        game.nameKey, game.factionLabelKey,
        ...game.phases.map((p) => p.labelKey),
        ...(game.trackers ?? []).flatMap((t) => [t.labelKey, ...(t.options ?? []).map((o) => o.labelKey)]),
        ...(game.playSetup ? [...game.playSetup.rollOffs.flatMap((r) => [r.labelKey, r.helpKey]), ...game.playSetup.roundPicks.map((r) => r.labelKey), ...game.playSetup.pools.map((p) => p.labelKey)] : []),
        ...variants.flatMap((v) => [v.labelKey, ...keysOf(v.fields), ...v.settingsFields.map((f) => f.labelKey), ...Object.values(v.readyMade?.labelKeys ?? {})]),
        ...keysOf(game.listBuilder?.fields ?? []),
        ...(game.listBuilder?.settingsFields ?? []).map((f) => f.labelKey),
      ]);
      const missing = [...keys].filter((k) => !(k in en) || !(k in de));
      expect(missing).toEqual([]);
    });
  }
});
