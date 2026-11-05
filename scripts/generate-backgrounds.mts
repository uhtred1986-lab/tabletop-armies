/**
 * Paints the scene plates behind the app's screens: 5 worlds × 3 places (hall, table, field), one dark plate each
 * (every world is dark-only today). Adapted from Gullet Cove's scripts/generate-ui-backgrounds.mts: same Google image
 * API, same composition rule (calm left 60 % where panels sit, detail on the right).
 *
 *   npx tsx scripts/generate-backgrounds.mts                    # all 15
 *   npx tsx scripts/generate-backgrounds.mts --world=saga       # one world
 *   npx tsx scripts/generate-backgrounds.mts --world=saga field # one plate
 *   npx tsx scripts/generate-backgrounds.mts --dry              # print prompts only
 *
 * Reads GOOGLE_API_KEY (or GEMINI_API_KEY) from the environment or .env.local. Writes raw JPEGs to
 * data/backgrounds-raw/<world>/<place>.jpg (git-ignored); `scripts/process-backgrounds.mts` turns approved raws into
 * the WebP plates under public/theme/backgrounds/. An existing raw is reused, never repainted: delete it to repaint.
 *
 * PAID: about $0.15–0.25 per plate at 2K. Every run needs Heyhey's ask in the chat (CLAUDE.md, "Paid calls").
 * IP: original scenes only. No characters, people, creatures, symbols, emblems, logos, text, or anything from a
 * publisher's setting (docs/product/plan.md, "IP constraints").
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MODEL = process.env.BG_MODEL ?? "gemini-3-pro-image";
const SIZE = process.env.BG_SIZE ?? "2K";
const API = "https://generativelanguage.googleapis.com/v1beta/interactions";
const OUT = join("data", "backgrounds-raw");

function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env.local")) return undefined;
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith(name + "="));
  return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") || undefined;
}

/** Shared by every plate: the composition panels need, and the IP line. */
const FRAME =
  "Ultra-wide cinematic composition. The LEFT 60 percent of the frame is calm and nearly empty (sky, haze, shadow or a plain wall) because interface panels will cover it; " +
  "all detail sits on the right edge and upper right. Dark overall, low-key lighting, the left 60 percent dark but not pure black. " +
  "No characters, no people, no creatures, no vehicles in the foreground. No text, no letters, no numbers, no symbols, no emblems, no logos, no flags, no frame, no border.";

interface World {
  style: string;
  places: Record<"hall" | "table" | "field", string>;
}

/** Our own descriptions of each world's mood (docs/design/system/README.md, "Worlds"). */
const WORLDS: Record<string, World> = {
  sigmar: {
    style:
      "Painterly mythic high-fantasy illustration, rich oil brushwork, deep charcoal and night-blue palette with burnished brass gold and a touch of storm teal, a gilded ledger mood.",
    places: {
      hall: "A vast vaulted hall inside a mountain fortress at night: on the right, carved stone pillars, tall plain cloth banners and brass braziers with warm firelight; a tall arched window high on the right showing storm clouds; on the left, smooth dark stone fading into shadow.",
      table: "A war-council chamber by candlelight: on the right, a great stone table with a carved relief landscape, brass instruments, an hourglass and rolled maps; on the left, a plain dark stone wall in deep shadow.",
      field: "A mythic battlefield plain under a storm sky at dusk: on the right, broken gilded statues, toppled marble pillars and a ruined archway; distant jagged mountains; faint lightning in the clouds; on the left, open dark grassland under heavy clouds.",
    },
  },
  crisis: {
    style:
      "Bold comic-book splash-page illustration, heavy black ink lines, flat colour with subtle halftone dot shading, night palette of deep navy with caption yellow and hero red accents.",
    places: {
      hall: "Inside a high-tech rooftop headquarters at night: on the right, a wall of glowing blank monitors, steel girders and a giant round window over a city skyline; on the left, a plain dark steel wall.",
      table: "A briefing room at night: on the right, a round table with a glowing holographic city map and steel chairs, a big window with skyscrapers behind; on the left, a plain dark wall with soft yellow light.",
      field: "City rooftops at night after a battle: on the right, water towers, shattered skylights, smoke and sparks, tall skyscrapers with lit windows, a dramatic sky streaked red and yellow; on the left, open night sky over the rooftops.",
    },
  },
  legion: {
    style:
      "Gritty military science-fiction concept art, painterly, dusty olive and charcoal palette with signal amber lights and steel grey, field-command mood.",
    places: {
      hall: "A field depot at night: on the right, a prefab hangar with stacked supply crates, cables, fuel drums and amber work lamps; on the left, a plain dark corrugated wall.",
      table: "A field command post inside a bunker: on the right, a tactical table glowing with an amber grid map, field radios, maps pinned to sandbags; on the left, plain dark concrete in shadow.",
      field: "A war-torn alien plain at dusk: on the right, trench lines, smoking craters, a ruined prefab outpost and a wrecked comms tower; a single pale moon over dust clouds; on the left, open dusty ground and hazy sky.",
    },
  },
  saga: {
    style:
      "Cinematic space-opera matte painting, deep space blacks and navy with luminous cyan blue light and a touch of crimson, epic and quiet.",
    places: {
      hall: "A starship observation deck: on the right, sleek curved white-and-steel walls with soft blue light strips and a giant window onto a cyan nebula and a ringed planet; on the left, dark empty deck and starfield.",
      table: "An ancient stone temple on an alien world at night: on the right, weathered monoliths and pillars lit by soft blue glow, a low round stone table; on the left, dark sky with faint stars.",
      field: "A duelling ground on a cliff above an alien canyon at twilight: on the right, ruined monoliths, glowing crystal shards and sheer rock spires; a sky blending deep navy, cyan and a red glow on the horizon; on the left, open dark sky and starfield.",
    },
  },
  gotham: {
    style:
      "Rain-soaked art-deco film-noir illustration, painterly, near-black and slate blue with gold lamplight and pale rain streaks, 1930s mood.",
    places: {
      hall: "An art-deco penthouse study at night: on the right, tall rain-streaked windows over a skyline of deco towers, gold sconces, a leather armchair and bookshelves; on the left, a plain dark panelled wall.",
      table: "A 1930s detective's office at night: on the right, venetian blinds casting stripes of light, a desk with a green lamp, files and a case board of pinned photographs without faces; on the left, a plain dark plaster wall.",
      field: "A rain-soaked art-deco city street at night: on the right, towering deco skyscrapers with stone ornaments, fire escapes, steam rising from grates, gold street lamps reflected in wet asphalt; on the left, dark rain and fog.",
    },
  },
};

async function paint(prompt: string, key: string): Promise<Buffer> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: "text", text: prompt }],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "16:9", image_size: SIZE },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const found = find(await res.json());
  if (!found) throw new Error("No image in the reply");
  return Buffer.from(found, "base64");
}

function find(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = find(n);
      if (f) return f;
    }
    return null;
  }
  const r = node as Record<string, unknown>;
  const type = r.mime_type ?? r.mimeType;
  if (typeof r.data === "string" && typeof type === "string" && type.startsWith("image/")) return r.data;
  const inline = (r.inline_data ?? r.inlineData) as Record<string, unknown> | undefined;
  if (inline && typeof inline.data === "string") return inline.data;
  for (const v of Object.values(r)) {
    const f = find(v);
    if (f) return f;
  }
  return null;
}

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const only = args.filter((a) => !a.startsWith("--"));
const worldArg = args.find((a) => a.startsWith("--world="))?.slice("--world=".length);
if (worldArg && !WORLDS[worldArg]) throw new Error(`Unknown world "${worldArg}": one of ${Object.keys(WORLDS).join(", ")}`);
const key = env("GOOGLE_API_KEY") ?? env("GEMINI_API_KEY");
if (!dry && !key) throw new Error("GOOGLE_API_KEY / GEMINI_API_KEY not set");

for (const [worldId, world] of Object.entries(WORLDS)) {
  if (worldArg && worldArg !== worldId) continue;
  const dir = join(OUT, worldId);
  mkdirSync(dir, { recursive: true });
  for (const [place, scene] of Object.entries(world.places)) {
    if (only.length && !only.includes(place)) continue;
    const prompt = `${world.style} ${scene} ${FRAME}`;
    if (dry) {
      console.log(`\n# ${worldId}/${place}\n${prompt}`);
      continue;
    }
    const path = join(dir, `${place}.jpg`);
    if (existsSync(path)) {
      console.log(`${worldId}/${place}: exists, skipping`);
      continue;
    }
    process.stdout.write(`${worldId}/${place}: painting … `);
    const img = await paint(prompt, key!);
    writeFileSync(path, img);
    console.log(`${(img.length / 1024).toFixed(0)} KB`);
  }
}
if (!dry) console.log(`\nDone → ${OUT}`);
