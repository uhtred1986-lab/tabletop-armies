type PackOption = { id: number; content: Record<string, unknown> };

/** Prefer the newest source pack that has selectable figures for newly built lists. */
export function defaultListPackId(packs: readonly PackOption[]): number | undefined {
  const withUnits = [...packs].reverse().find((pack) => {
    const catalogue = pack.content.catalogue;
    if (!catalogue || typeof catalogue !== "object" || Array.isArray(catalogue)) return false;
    const units = (catalogue as Record<string, unknown>).units;
    return Array.isArray(units) && units.length > 0;
  });
  return withUnits?.id ?? packs.at(-1)?.id;
}
