// The case file (gotham home) writes status text on light paper, where the world's --ok/--warn/--danger are too light.
// case-file.module.css mixes them toward --paper-ink (color-mix in srgb); this checks those exact mixes stay ≥ 4.5:1,
// and the other text pairs the home uses.
import { describe, expect, it } from "vitest";
import tokens from "../../../../docs/design/system/tokens.json";

type Token = { name: string; value: string | Record<string, string> };
const byName = new Map((tokens.color.tokens as Token[]).map((t) => [t.name, t]));
const colour = (name: string): string => {
  const t = byName.get(name);
  if (!t) throw new Error(`missing token ${name}`);
  const raw = typeof t.value === "string" ? t.value : t.value.gotham ?? Object.values(t.value)[0]!;
  const alias = /^\{(.+)\}$/.exec(raw);
  return alias ? colour(alias[1]!) : raw;
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** color-mix(in srgb, a p, b) */
const mix = (a: string, p: number, b: string) => toHex(rgb(a).map((v, i) => v * p + rgb(b)[i]! * (1 - p)));
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("case file contrast (gotham)", () => {
  const paper = colour("paper");
  const ink = colour("paper-ink");
  it("status text and the funding stamp on the index card ≥ 4.5:1", () => {
    expect(ratio(mix(colour("ok"), 0.4, ink), paper)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(mix(colour("warn"), 0.4, ink), paper)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(mix(colour("danger"), 0.6, ink), paper)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(colour("paper-muted"), paper)).toBeGreaterThanOrEqual(4.5);
  });
  it("tabs, corkboard and the primary action ≥ 4.5:1", () => {
    expect(ratio(ink, colour("paper-edge"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(ink, mix(colour("paper-edge"), 0.7, colour("paper-alt")))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(paper, colour("paper-alt"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(colour("accent-ink"), colour("accent"))).toBeGreaterThanOrEqual(4.5);
  });
});
