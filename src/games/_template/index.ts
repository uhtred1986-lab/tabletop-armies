// Template for a new game module. Copy this folder to src/games/<id>/, fill it in, list it in registry.ts,
// add its world (docs/ui-standard.md, "Adding a world") and its i18n keys. Skill: game-module.
import type { GameModule } from "../types";

export const template: GameModule = {
  id: "aos", // replace with the new GameId (add it to the GameId union in types.ts)
  world: "sigmar", // replace with the new WorldId
  nameKey: "game.template.name",
  factionLabelKey: "game.template.faction",
  phases: [],
};
