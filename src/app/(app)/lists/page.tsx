import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOwnerPage } from "@/lib/auth";
import { getLocale } from "@/i18n/server";
import { currentGame } from "@/lib/current-game";
import { getVariants, variantForDefinition } from "@/lib/lists/modules";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { ListsWorkspace } from "@/components/ListsWorkspace";
import type { ListValidationResult } from "@/games/types";
import { readOwnerCollectionSnapshot } from "@/lib/lists/collection-snapshot";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  await requireOwnerPage();
  const [game, locale] = await Promise.all([currentGame(), getLocale()]);
  const [packs, rows, collection] = await Promise.all([
    db.select().from(schema.dataPacks).where(eq(schema.dataPacks.gameId, game.id)).orderBy(asc(schema.dataPacks.sourceDate)),
    db.select().from(schema.armyLists).where(eq(schema.armyLists.gameId, game.id)).orderBy(asc(schema.armyLists.name)),
    readOwnerCollectionSnapshot(game.id),
  ]);
  const variants = getVariants(game);
  const packById = new Map(packs.map((pack) => [pack.id, pack]));
  const lists = rows.map((row) => {
    const definition = row.entries as Record<string, unknown>;
    const variant = variantForDefinition(game, definition);
    const pack = row.packId === null ? undefined : packById.get(row.packId);
    const settings = definition?.settings && typeof definition.settings === "object" ? definition.settings as Record<string, unknown> : {};
    const validation = variant?.validateList(definition, pack?.content ?? {}, { collection, constraints: settings }) ?? { issues: [], status: "incomplete" as const } satisfies ListValidationResult;
    return { id: row.id, name: row.name, packId: row.packId, variantId: variant?.id ?? "", definition, validation };
  });
  const packOptions = packs.map((pack) => ({
    id: pack.id,
    source: pack.source,
    sourceDate: pack.sourceDate,
    importedAt: pack.importedAt.toISOString(),
    content: pack.content as Record<string, unknown>,
  }));
  return (
    <>
      <SceneBackdrop area="lists" />
      <ListsWorkspace locale={locale} game={{ id: game.id, world: game.world, nameKey: game.nameKey, factionLabelKey: game.factionLabelKey }} variants={variants.map(({ id, labelKey, fields, settingsFields, manual }) => ({ id, labelKey, fields, settingsFields, manual }))} packs={packOptions} lists={lists} collection={collection} />
    </>
  );
}
