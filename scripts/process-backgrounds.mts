/**
 * Turns the chosen raw paintings into the WebP plates the app serves (src/lib/backgrounds.ts). Adapted from Gullet
 * Cove's scripts/process-ui-backgrounds.mts.
 *
 *   npx tsx scripts/process-backgrounds.mts                 # every raw found
 *   npx tsx scripts/process-backgrounds.mts --world=saga    # one world
 *
 * Reads data/backgrounds-raw/<world>/<place>.{png,jpg} (git-ignored) and writes
 * public/theme/backgrounds/<world>/<place>-{2400,1200}.webp, aspect kept. Prints each plate's size and mean luminance
 * (0-255) overall and for the left 60 % where panels sit; the veil in base.css assumes a dark plate (left ≈ 25-70).
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const RAW = join("data", "backgrounds-raw");
const OUT = join("public", "theme", "backgrounds");
const WIDTHS = [2400, 1200] as const;
const QUALITY: Record<number, number> = { 2400: 72, 1200: 70 };

async function luminance(file: string): Promise<{ mean: number; left60: number }> {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const split = Math.round(info.width * 0.6);
  let all = 0;
  let left = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const v = data[y * info.width + x] ?? 0;
      all += v;
      if (x < split) left += v;
    }
  return { mean: Math.round(all / (info.width * info.height)), left60: Math.round(left / (split * info.height)) };
}

/** Some paintings come back letterboxed; drop pure-black rows at the top and bottom so `cover` fills with picture. */
async function letterbox(file: string): Promise<{ top: number; height: number; width: number }> {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const dark = (y: number) => {
    let max = 0;
    for (let x = 0; x < info.width; x += 4) max = Math.max(max, data[y * info.width + x] ?? 0);
    return max < 8;
  };
  let top = 0;
  while (top < info.height / 4 && dark(top)) top++;
  let bottom = info.height - 1;
  while (bottom > (info.height * 3) / 4 && dark(bottom)) bottom--;
  return { top, height: bottom - top + 1, width: info.width };
}

const worldArg = process.argv.slice(2).find((a) => a.startsWith("--world="))?.slice("--world=".length);
if (!existsSync(RAW)) throw new Error(`${RAW} not found: paint first (scripts/generate-backgrounds.mts)`);

for (const world of readdirSync(RAW)) {
  if (worldArg && world !== worldArg) continue;
  const dir = join(RAW, world);
  if (!statSync(dir).isDirectory()) continue;
  mkdirSync(join(OUT, world), { recursive: true });
  for (const file of readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f))) {
    const place = file.replace(/\.(png|jpe?g)$/i, "");
    const box = await letterbox(join(dir, file));
    for (const width of WIDTHS) {
      const out = join(OUT, world, `${place}-${width}.webp`);
      await sharp(join(dir, file))
        .extract({ left: 0, top: box.top, width: box.width, height: box.height })
        .resize({ width }).webp({ quality: QUALITY[width], effort: 6 }).toFile(out);
      const { mean, left60 } = await luminance(out);
      console.log(`${world}/${place}-${width}: ${(statSync(out).size / 1024).toFixed(0)} KB · mean ${mean} · left60 ${left60}`);
    }
  }
}
