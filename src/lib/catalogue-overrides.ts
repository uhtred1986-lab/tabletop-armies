export type CatalogueOverride = { targetId: string; field: string; value: unknown };

export function isValidOverridePath(path: string): boolean {
  const keys = path.split(".");
  return keys.length > 0 && keys.length <= 6 && keys.every((key) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) && !["__proto__", "prototype", "constructor", "id", "sourceId"].includes(key));
}

/** Applies owner corrections by stable catalogue ID without mutating source content or owner collection rows. */
export function applyCatalogueOverrides<T extends { catalogue?: Record<string, unknown> }>(pack: T, overrides: readonly CatalogueOverride[]): T {
  const result = structuredClone(pack);
  if (!result.catalogue) return result;
  const records = Object.values(result.catalogue).flatMap((section) => Array.isArray(section) ? section : []);
  for (const override of overrides) {
    const target = records.find((record) => isRecord(record) && record.id === override.targetId);
    if (!target || !isRecord(target)) continue;
    setSafePath(target, override.field, override.value);
  }
  return result;
}

function setSafePath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  if (!isValidOverridePath(path)) {
    throw new Error(`Invalid override field path: ${path}`);
  }
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    const child = cursor[key];
    if (child === undefined) cursor[key] = {};
    else if (!isRecord(child)) throw new Error(`Override path is not an object at ${key}`);
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]!] = structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
