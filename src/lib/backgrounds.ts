import type { WorldId } from "@/games/types";

/**
 * Scene plates: the painted backgrounds behind each screen, one set per world (docs/ui-standard.md §3, "Scene
 * plates"). Same idea as Gullet Cove's `src/lib/backgrounds.ts`: a calm left 60 % where panels sit, detail on the
 * right. Every world is dark-only today, so there is one plate per place, not a day/night pair.
 *
 * The only source of `/theme/backgrounds/...` paths. Painted by `scripts/generate-backgrounds.mts` (prompts) and
 * processed by `scripts/process-backgrounds.mts`; `backgrounds.test.ts` checks every plate is on disk.
 */

/** The three places a world shows. Each screen picks the one that fits what you do there. */
export type ScenePlace = "hall" | "table" | "field";

export const SCENE_PLACES: readonly ScenePlace[] = ["hall", "table", "field"];

/** Which place backs which screen: the hobby side (hall), planning (table), the game itself (field). */
export const SCENE_FOR = {
  hub: "hall",
  collection: "hall",
  places: "hall",
  paint: "hall",
  kit: "hall",
  lists: "table",
  stats: "table",
  campaigns: "table",
  data: "table",
  play: "field",
} as const satisfies Record<string, ScenePlace>;

export type SceneArea = keyof typeof SCENE_FOR;

export const PLATE_WIDTHS = [1200, 2400] as const;
export type PlateWidth = (typeof PLATE_WIDTHS)[number];

export function plateUrl(world: WorldId, place: ScenePlace, width: PlateWidth): string {
  return `/theme/backgrounds/${world}/${place}-${width}.webp`;
}
