import { describe, expect, it } from "vitest";
import { fundingFor } from ".";

describe("bmg funding", () => {
  it("gives $500 per 150 Rep or part thereof", () => {
    expect(fundingFor(100)).toBe(500);
    expect(fundingFor(150)).toBe(500);
    expect(fundingFor(300)).toBe(1000);
    expect(fundingFor(350)).toBe(1500);
    expect(fundingFor(460)).toBe(2000);
  });
});
