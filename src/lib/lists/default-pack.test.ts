import { describe, expect, it } from "vitest";
import { defaultListPackId } from "./default-pack";

describe("defaultListPackId", () => {
  it("prefers the newest pack containing units over a newer mode-only pack", () => {
    expect(defaultListPackId([
      { id: 1, content: { catalogue: { units: [{ id: "unit-1" }] } } },
      { id: 2, content: { catalogue: { units: [] , modes: [{ id: "mode-1" }] } } },
    ])).toBe(1);
  });

  it("uses the newest available unit pack, or the newest partial pack when none has units", () => {
    expect(defaultListPackId([
      { id: 1, content: { catalogue: { units: [{ id: "old" }] } } },
      { id: 2, content: { catalogue: { units: [{ id: "new" }] } } },
      { id: 3, content: { catalogue: { modes: [{ id: "mode" }] } } },
    ])).toBe(2);
    expect(defaultListPackId([{ id: 4, content: { catalogue: { modes: [{ id: "mode" }] } } }])).toBe(4);
    expect(defaultListPackId([])).toBeUndefined();
  });
});
