import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { games } from "@/games/registry";
import { PLATE_WIDTHS, plateUrl, SCENE_PLACES } from "./backgrounds";

// Every world shows every place, so every plate must be on disk; a missing one would leave a screen bare.
describe("scene plates", () => {
  const worlds = [...new Set(games.map((g) => g.world))];
  for (const world of worlds)
    for (const place of SCENE_PLACES)
      for (const width of PLATE_WIDTHS)
        it(`${world}/${place} at ${width}`, () => {
          expect(existsSync(`public${plateUrl(world, place, width)}`)).toBe(true);
        });
});
