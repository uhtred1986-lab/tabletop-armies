import type { GameModule, ListBuilderVariant } from "@/games/types";

export function getVariants(game: GameModule): ListBuilderVariant[] {
  if (!game.listBuilder) return [];
  return game.listBuilder.variants?.length ? game.listBuilder.variants : [{
    id: "default",
    labelKey: game.nameKey,
    schema: game.listBuilder.schema,
    selectionsSchema: game.listBuilder.schema,
    fields: game.listBuilder.fields,
    settingsFields: game.listBuilder.settingsFields,
    manual: game.listBuilder.manual,
    validateList: game.listBuilder.validateList,
  }];
}

export const getVariant = (game: GameModule, id: string): ListBuilderVariant | undefined => getVariants(game).find((variant) => variant.id === id);

export function variantForDefinition(game: GameModule, definition: unknown): ListBuilderVariant | undefined {
  return getVariants(game).find((variant) => variant.schema.safeParse(definition).success);
}
