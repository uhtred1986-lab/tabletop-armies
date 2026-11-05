import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireOwner: async () => ({ ok: false, error: "unauthorised" }) }));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("Database must not be touched without an owner session"); } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  addRenownEvent,
  createCampaign,
  deleteCampaign,
  deleteInjury,
  deleteRosterUnit,
  deleteRuleValue,
  deleteTerritory,
  importConfig,
  linkGame,
  saveInjury,
  saveRosterUnit,
  saveRuleValue,
  saveTerritory,
  unlinkGame,
  updateCampaign,
} from "./actions";

const actions = [
  createCampaign,
  updateCampaign,
  deleteCampaign,
  linkGame,
  unlinkGame,
  saveRosterUnit,
  deleteRosterUnit,
  addRenownEvent,
  saveInjury,
  deleteInjury,
  saveTerritory,
  deleteTerritory,
  saveRuleValue,
  deleteRuleValue,
  importConfig,
];

describe("campaign Server Function authorization", () => {
  it.each(actions)("returns an authorization failure before touching data", async (action) => {
    const state = await action({}, new FormData());
    expect(state).toEqual({ error: "campaigns.error.auth" });
  });
});
