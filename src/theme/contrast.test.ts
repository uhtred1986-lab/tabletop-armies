// Every world must keep text readable (docs/ui-standard.md §3): ink, ink-muted and the status colours on ground and
// both surfaces, and accent-ink on accent, at 4.5:1 or better.
import { describe, expect, it } from "vitest";
import tokens from "../../docs/design/system/tokens.json";

type Token = { name: string; value: string | Record<string, string> };
const themes = tokens.color.themes.map((t) => t.id);
const byName = new Map((tokens.color.tokens as Token[]).map((t) => [t.name, t]));

const colour = (name: string, theme: string): string => {
  const t = byName.get(name);
  if (!t) throw new Error(`missing token ${name}`);
  const raw = typeof t.value === "string" ? t.value : (t.value[theme] ?? t.value[themes[0]!]);
  const alias = /^\{(.+)\}$/.exec(raw ?? "");
  return alias ? colour(alias[1]!, theme) : raw!;
};

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("world contrast", () => {
  for (const theme of themes) {
    it(`${theme}: text on every surface ≥ 4.5:1`, () => {
      for (const text of ["ink", "ink-muted", "ok", "warn", "danger", "accent"]) {
        for (const ground of ["ground", "surface-1", "surface-2"]) {
          expect(ratio(colour(text, theme), colour(ground, theme)), `${text} on ${ground}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(ratio(colour("accent-ink", theme), colour("accent", theme)), "accent-ink on accent").toBeGreaterThanOrEqual(4.5);
      // World homes (docs/ui-standard.md §3, "World homes"): text written on the world's paper.
      for (const text of ["paper-ink", "paper-muted"]) {
        expect(ratio(colour(text, theme), colour("paper", theme)), `${text} on paper`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
