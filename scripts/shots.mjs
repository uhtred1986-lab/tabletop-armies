// Screen proof for docs/ui-standard.md §9 (issue #6): screenshots of routes in chosen worlds at 1440×900, 1180×820
// (touch) and 390×844 (touch), and a check for page errors, horizontal overflow, and tap targets under 44 px on touch.
//
//   node scripts/shots.mjs --base http://localhost:3000 --games aos,mcp --routes /,/lists --out data/shots
//
// Defaults: every game, the home route, out=data/shots (git-ignored). Exit code 1 when any check fails.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// Playwright is preinstalled in cloud sessions (global, not a project dependency); require() finds it there.
const { chromium } = createRequire(import.meta.url)("playwright");

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const base = arg("base", "http://localhost:3000");
const games = arg("games", "aos,mcp,legion,shatterpoint,bmg").split(",");
const routes = arg("routes", "/").split(",");
const out = arg("out", "data/shots");
const sizes = [[1440, 900, false], [1180, 820, true], [390, 844, true]];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
let failures = 0;
for (const game of games) for (const [width, height, touch] of sizes) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
  await context.addCookies([{ name: "muster-game", value: game, url: base }]);
  const page = await context.newPage();
  for (const route of routes) {
    const errors = [];
    page.removeAllListeners("pageerror");
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    const response = await page.goto(base + route, { waitUntil: "networkidle", timeout: 120000 });
    const found = await page.evaluate((isTouch) => {
      const overflow = document.documentElement.scrollWidth > innerWidth + 1;
      const small = [];
      if (isTouch) for (const el of document.querySelectorAll("main a, main button, main select, nav a, nav button")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.height < 43.5) small.push(`${(el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30)} (${Math.round(r.height)}px)`);
      }
      return { overflow, small: small.slice(0, 5) };
    }, touch);
    const file = `${out}/${game}${route.replace(/\//g, "-") || "-home"}-${width}.png`;
    await page.screenshot({ path: file });
    const problems = [response?.status() !== 200 && `HTTP ${response?.status()}`, ...errors, found.overflow && "horizontal overflow", ...found.small.map((s) => `small target: ${s}`)].filter(Boolean);
    if (problems.length) failures++;
    console.log(`${problems.length ? "✗" : "✓"} ${game} ${width} ${route}${problems.length ? ": " + problems.join("; ") : ""}`);
  }
  await context.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
