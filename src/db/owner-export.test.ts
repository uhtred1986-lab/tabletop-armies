import { describe, expect, it } from "vitest";
import { OWNER_TABLES } from "./schema";

describe("owner export boundary", () => {
  it("excludes catalogue content, including copies staged for review", () => {
    for (const catalogueTable of ["data_packs", "pack_assets", "import_runs", "import_candidates"]) {
      expect(OWNER_TABLES).not.toContain(catalogueTable);
    }
    expect(OWNER_TABLES).toEqual(expect.arrayContaining(["collection_items", "collection_models", "photos", "collection_overrides", "army_lists", "game_events", "campaigns"]));
    expect(new Set(OWNER_TABLES).size).toBe(OWNER_TABLES.length);
  });
});
