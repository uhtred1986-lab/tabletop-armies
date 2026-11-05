import type { CSSProperties } from "react";
import { currentGame } from "@/lib/current-game";
import { plateUrl, SCENE_FOR, type SceneArea } from "@/lib/backgrounds";

/**
 * The painted plate behind a screen, in the current game's world (docs/ui-standard.md §3, "Scene plates").
 * Put it first inside a page; it fills the main column behind the content and never takes space. The veil over it
 * is the world's own `ground` colour (base.css `.scene`), so text set on the ground keeps its contrast; cards and
 * panels are opaque.
 */
export async function SceneBackdrop({ area }: { area: SceneArea }) {
  const game = await currentGame();
  const place = SCENE_FOR[area];
  const style = {
    "--plate-s": `url("${plateUrl(game.world, place, 1200)}")`,
    "--plate-l": `url("${plateUrl(game.world, place, 2400)}")`,
  } as CSSProperties;
  return <div className="scene" data-place={place} aria-hidden="true" style={style} />;
}
