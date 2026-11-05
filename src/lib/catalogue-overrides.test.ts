import { describe, expect, it } from "vitest";
import { applyCatalogueOverrides, isValidOverridePath } from "./catalogue-overrides";

describe("catalogue override paths", () => {
  it("allows ordinary profile corrections and blocks identity or prototype mutation", () => {
    expect(isValidOverridePath("points")).toBe(true);
    expect(isValidOverridePath("image.reference")).toBe(true);
    expect(isValidOverridePath("id")).toBe(false);
    expect(isValidOverridePath("nested.sourceId")).toBe(false);
    expect(isValidOverridePath("__proto__.polluted")).toBe(false);
    expect(isValidOverridePath("points." )).toBe(false);
  });

  it("applies corrections to a stable target without changing its identity", () => {
    const pack = { catalogue: { units: [{ id: "stable-unit", sourceId: "source-1", points: 100 }] } };
    const changed = applyCatalogueOverrides(pack, [{ targetId: "stable-unit", field: "points", value: 90 }]);
    expect(changed.catalogue.units[0]).toEqual({ id: "stable-unit", sourceId: "source-1", points: 90 });
  });
});
