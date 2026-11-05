import { describe, expect, it } from "vitest";
import { readStarterBoxes } from "./starter-boxes";

describe("readStarterBoxes", () => {
  it("reads selected metadata from newest packs and does not create ownership entries", () => {
    const boxes = readStarterBoxes([
      { content: { catalogue: { starterBoxes: [{ id: "test-set", name: "Invented Starter", sku: "TEST-1", contentsVerified: false, contents: [], statsConfigured: false }] } } },
      { content: { constraints: { starterSelections: [{ id: "test-set", name: "Older label" }, { id: "other-set", name: "Other Starter", contents: [] }] } } },
    ]);
    expect(boxes).toEqual([
      { id: "test-set", name: "Invented Starter", sku: "TEST-1", productUrl: null, contentsVerified: false, contents: [], statsConfigured: false },
      { id: "other-set", name: "Other Starter", sku: null, productUrl: null, contentsVerified: false, contents: [], statsConfigured: false },
    ]);
  });

  it("ignores malformed metadata and treats missing contents as unconfigured", () => {
    expect(readStarterBoxes([{ content: { catalogue: { starterBoxes: [null, { id: "", name: "No ID" }, { id: "valid", name: "Valid" }] } } }])).toEqual([
      { id: "valid", name: "Valid", sku: null, productUrl: null, contentsVerified: false, contents: [], statsConfigured: false },
    ]);
  });
});
