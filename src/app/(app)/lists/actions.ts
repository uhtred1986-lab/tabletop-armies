"use server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/auth";
import { games } from "@/games/registry";
import type { ListValidationResult } from "@/games/types";
import { getVariant } from "@/lib/lists/modules";
import { readOwnerCollectionSnapshot } from "@/lib/lists/collection-snapshot";

type ListFailure = { ok: false; error: string };
type ListSuccess<T> = { ok: true; value: T };
type ListResult<T> = ListFailure | ListSuccess<T>;
type SaveListInput = { gameId: string; listId?: number; packRowId?: number; variantId: string; definition: unknown };
type SaveListResult = ListResult<{ id: number; validation: ListValidationResult }>;
type DeleteListInput = { gameId: string; listId: number };

export async function saveList(input: SaveListInput): Promise<SaveListResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const game = games.find((candidate) => candidate.id === input.gameId);
    if (!game?.listBuilder || !Number.isInteger(input.packRowId) && input.packRowId !== undefined) return { ok: false, error: "invalid-game" };
    const variant = getVariant(game, input.variantId);
    if (!variant) return { ok: false, error: "invalid-variant" };
    const parsed = variant.schema.safeParse(input.definition);
    if (!parsed.success) return { ok: false, error: "invalid-list" };
    const definition = parsed.data as Record<string, unknown>;
    const packRow = typeof input.packRowId === "number"
      ? (await db.select().from(schema.dataPacks).where(and(eq(schema.dataPacks.id, input.packRowId), eq(schema.dataPacks.gameId, game.id))).limit(1))[0]
      : undefined;
    if (input.packRowId !== undefined && !packRow) return { ok: false, error: "pack-not-found" };
    if (packRow && definition.dataPackId !== String((packRow.content as Record<string, unknown>)?.packId ?? "")) return { ok: false, error: "pack-mismatch" };
    const collection = await readOwnerCollectionSnapshot(game.id);
    const settings = {
      collection,
      constraints: (definition.settings && typeof definition.settings === "object" ? definition.settings : {}) as Record<string, unknown>,
    };
    const validation = variant.validateList(definition, packRow?.content ?? {}, settings);
    let id: number;
    if (input.listId !== undefined) {
      if (!Number.isInteger(input.listId) || input.listId < 1) return { ok: false, error: "invalid-list-id" };
      const [saved] = await db.update(schema.armyLists).set({
        name: String(definition.name),
        packId: packRow?.id ?? null,
        entries: definition,
        notes: null,
        updatedAt: new Date(),
      }).where(and(eq(schema.armyLists.id, input.listId), eq(schema.armyLists.gameId, game.id))).returning({ id: schema.armyLists.id });
      if (!saved) return { ok: false, error: "list-not-found" };
      id = saved.id;
    } else {
      const [saved] = await db.insert(schema.armyLists).values({
        gameId: game.id,
        name: String(definition.name),
        packId: packRow?.id ?? null,
        entries: definition,
      }).returning({ id: schema.armyLists.id });
      if (!saved) return { ok: false, error: "list-save-failed" };
      id = saved.id;
    }
    return { ok: true, value: { id, validation } };
  } catch {
    return { ok: false, error: "list-save-failed" };
  }
}

export async function deleteList(input: DeleteListInput): Promise<ListResult<null>> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const game = games.find((candidate) => candidate.id === input.gameId);
    if (!game || !Number.isInteger(input.listId) || input.listId < 1) return { ok: false, error: "invalid-list" };
    const removed = await db.delete(schema.armyLists).where(and(eq(schema.armyLists.id, input.listId), eq(schema.armyLists.gameId, game.id))).returning({ id: schema.armyLists.id });
    return removed.length ? { ok: true, value: null } : { ok: false, error: "list-not-found" };
  } catch {
    return { ok: false, error: "list-delete-failed" };
  }
}
