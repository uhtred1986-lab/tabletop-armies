import type { HomeList } from "./types";

/** The pack a list was built against, in the `{ id, content }` shape the world-home helpers take; undefined without one. */
export function listPack(list: Pick<HomeList, "packId" | "packContent"> | undefined): { id: number; content: unknown } | undefined {
  if (!list || list.packId === null || list.packContent === undefined) return undefined;
  return { id: list.packId, content: list.packContent };
}
