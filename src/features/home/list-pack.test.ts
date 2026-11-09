import { describe, expect, it } from "vitest";
import { listPack } from "./list-pack";

describe("listPack", () => {
  it("gives the list's own pack", () => {
    expect(listPack({ packId: 4, packContent: { catalogue: {} } })).toEqual({ id: 4, content: { catalogue: {} } });
  });
  it("is undefined without a list, a pack id or loaded content", () => {
    expect(listPack(undefined)).toBeUndefined();
    expect(listPack({ packId: null, packContent: {} })).toBeUndefined();
    expect(listPack({ packId: 4, packContent: undefined })).toBeUndefined();
  });
});
