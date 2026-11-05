import { describe, expect, it } from "vitest";
import { calculateOwnershipSnapshot, calculatePaintProgress, planModelMove, planModelMoveUndo } from "./domain";
import { isValidPhotoPayload, MAX_PHOTO_BYTES } from "./photo-validation";

describe("collection domain", () => {
  it("moves an already split unit together and restores each model's exact place on undo", () => {
    const before = [
      { id: 1, placeId: 5 },
      { id: 2, placeId: null },
      { id: 3, placeId: 8 },
    ];
    const move = planModelMove(before, 12);
    expect(move).toEqual([
      { modelId: 1, fromPlaceId: 5, toPlaceId: 12 },
      { modelId: 2, fromPlaceId: null, toPlaceId: 12 },
      { modelId: 3, fromPlaceId: 8, toPlaceId: 12 },
    ]);
    const after = before.map((model) => ({ ...model, placeId: 12 }));
    const undo = planModelMoveUndo(after, move);
    expect(undo?.map((change) => ({ id: change.modelId, placeId: change.toPlaceId }))).toEqual([
      { id: 1, placeId: 5 },
      { id: 2, placeId: null },
      { id: 3, placeId: 8 },
    ]);
  });

  it("does not undo a place after another move has changed it", () => {
    const move = planModelMove([{ id: 3, placeId: 8 }], 12);
    expect(planModelMoveUndo([{ id: 3, placeId: 14 }], move)).toBeNull();
  });

  it("derives painted totals and percentages by faction from the configured final stage", () => {
    expect(calculatePaintProgress([
      { faction: "Blue Cohort", stageId: 2 },
      { faction: "Blue Cohort", stageId: 7 },
      { faction: "Red Guard", stageId: 7 },
      { faction: null, stageId: 1 },
    ], 7)).toEqual({
      total: 4,
      painted: 2,
      percent: 50,
      factions: [
        { faction: "Blue Cohort", total: 2, painted: 1, percent: 50 },
        { faction: "Red Guard", total: 1, painted: 1, percent: 100 },
        { faction: null, total: 1, painted: 0, percent: 0 },
      ],
    });
  });

  it("derives per-profile owned and painted model counts from collection model rows", () => {
    expect(calculateOwnershipSnapshot([
      { unitId: "profile-alpha", stageId: 2 },
      { unitId: "profile-alpha", stageId: 7 },
      { unitId: "profile-beta", stageId: 1 },
      { unitId: null, stageId: 7 },
    ], 7)).toEqual({
      ownedUnitIds: ["profile-alpha", "profile-beta"],
      unitCounts: { "profile-alpha": 2, "profile-beta": 1 },
      paintedUnitIds: ["profile-alpha"],
      paintedModelCounts: { "profile-alpha": 1 },
    });
  });
});

describe("photo validation", () => {
  it("accepts valid JPEG, PNG and WebP headers and rejects spoofed MIME, bad signatures, mismatched sizes and oversized files", () => {
    expect(isValidPhotoPayload("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe(true);
    expect(isValidPhotoPayload("image/png", Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]))).toBe(true);
    const webp = new Uint8Array(13);
    webp.set([82, 73, 70, 70], 0);
    webp.set([87, 69, 66, 80], 8);
    expect(isValidPhotoPayload("image/webp", webp)).toBe(true);
    expect(isValidPhotoPayload("image/png", Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe(false);
    expect(isValidPhotoPayload("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff]), 4)).toBe(false);
    expect(isValidPhotoPayload("image/jpeg", new Uint8Array(MAX_PHOTO_BYTES + 1))).toBe(false);
    expect(isValidPhotoPayload("image/svg+xml", Uint8Array.from([60, 115, 118, 103, 62]))).toBe(false);
  });
});
