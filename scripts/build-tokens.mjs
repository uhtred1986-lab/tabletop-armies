// Turns docs/design/system/tokens.json (the Tabletop Armies design system's tokens) into src/theme/tokens.css.
// Colours and the frame shadow become one block per world theme; spacing, radius and font families go on :root.
// Run with `npm run tokens` after changing tokens.json; never edit tokens.css by hand.
import { readFileSync, writeFileSync } from "node:fs";

const src = new URL("../docs/design/system/tokens.json", import.meta.url);
const out = new URL("../src/theme/tokens.css", import.meta.url);
const tokens = JSON.parse(readFileSync(src, "utf8"));

const themes = tokens.color.themes.map((t) => t.id);
const first = themes[0];

const valueFor = (token, theme) => {
  const v = token.value;
  const raw = typeof v === "string" ? v : (v[theme] ?? v[first]);
  if (raw == null) return null;
  const alias = /^\{(.+)\}$/.exec(raw);
  return alias ? `var(--${alias[1]})` : raw;
};

const lines = ["/* Tabletop Armies — generated from docs/design/system/tokens.json by scripts/build-tokens.mjs. Do not edit. */", ""];

for (const theme of themes) {
  const sel = theme === first ? `:root, [data-theme="${theme}"]` : `[data-theme="${theme}"]`;
  lines.push(`${sel} {`);
  for (const t of tokens.color.tokens) {
    const v = valueFor(t, theme);
    if (v) lines.push(`  --${t.name}: ${v};`);
  }
  for (const t of tokens.shadow?.tokens ?? []) {
    const v = valueFor(t, theme);
    if (v) lines.push(`  --${t.name}: ${v};`);
  }
  lines.push("}", "");
}

lines.push(":root {");
for (const fam of ["spacing", "radius"]) {
  for (const t of tokens[fam]?.tokens ?? []) lines.push(`  --${t.name}: ${t.value};`);
}
for (const [key, stack] of Object.entries(tokens.type.families)) lines.push(`  --font-${key}: ${stack};`);
lines.push("}", "");

writeFileSync(out, lines.join("\n"));
console.log(`tokens.css: ${themes.length} themes, ${tokens.color.tokens.length} colours`);
