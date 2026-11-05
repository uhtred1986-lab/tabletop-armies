"use server";

import { and, desc, eq, max, sum } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  campaigns,
  campaignGames,
  campaignRosterUnits,
  campaignRenownEvents,
  campaignTerritories,
  campaignUnitInjuries,
  collectionItems,
  gameEvents,
  playedGames,
} from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { currentGame } from "@/lib/current-game";
import type { FormState } from "@/features/campaigns/ActionForm";

type Kind = "generic" | "path_to_glory";
type ConfigRule = { name: string; value: string; source?: string };

const ok = (): FormState => ({ ok: true });
const fail = (error: string): FormState => ({ error });
const text = (data: FormData, name: string, limit = 2000) => {
  const value = data.get(name);
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
};
const nullable = (value: string) => value || null;
const idOf = (data: FormData, name: string) => {
  const n = Number(text(data, name, 20));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const dateOf = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const completedOutcome = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).result;
  return value === "win" || value === "loss" || value === "draw" ? value : null;
};
const objectValue = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const pathFor = (id?: number) => (id ? `/campaigns/${id}` : "/campaigns");
const invalid = () => fail("campaigns.error.invalid");

async function ownedCampaign(id: number) {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return row;
}

async function currentCampaign(id: number) {
  const campaign = await ownedCampaign(id);
  if (!campaign) return { error: "campaigns.error.notFound" as const };
  if (campaign.gameId !== (await currentGame()).id) return { error: "campaigns.error.wrongGame" as const };
  return { campaign } as const;
}

async function ownedRosterUnit(id: number, campaignId: number) {
  const [row] = await db
    .select()
    .from(campaignRosterUnits)
    .where(and(eq(campaignRosterUnits.id, id), eq(campaignRosterUnits.campaignId, campaignId)))
    .limit(1);
  return row;
}

function rulesFrom(config: unknown): ConfigRule[] {
  const raw = config as { rules?: unknown } | null;
  if (!Array.isArray(raw?.rules)) return [];
  return raw.rules.filter((rule): rule is ConfigRule => !!rule && typeof rule === "object" && typeof (rule as ConfigRule).name === "string" && typeof (rule as ConfigRule).value === "string");
}

type RuleMutation = "saved" | "notFound" | "invalid";

/** Serialize rule edits/imports across devices so concurrent read-modify-write actions cannot overwrite each other. */
async function mutateRules(campaignId: number, mutate: (rules: ConfigRule[]) => ConfigRule[] | null): Promise<RuleMutation> {
  return db.transaction(async (tx) => {
    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).for("update").limit(1);
    if (!campaign) return "notFound";
    const next = mutate(rulesFrom(campaign.config));
    if (!next) return "invalid";
    await tx.update(campaigns).set({ config: { ...objectValue(campaign.config), rules: next }, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
    return "saved";
  });
}

export async function createCampaign(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const gameId = (await currentGame()).id;
  const name = text(data, "name", 120);
  const ownerLabel = text(data, "ownerLabel", 120);
  const kind = text(data, "kind", 30) as Kind;
  if (!name || !["generic", "path_to_glory"].includes(kind)) return fail("campaigns.error.required");
  if (kind === "path_to_glory" && gameId !== "aos") return invalid();
  try {
    const [created] = await db.insert(campaigns).values({ gameId, name, kind, config: { rules: [], ...(ownerLabel ? { ownerLabel } : {}) } }).returning({ id: campaigns.id });
    if (!created) return invalid();
    revalidatePath("/campaigns");
    revalidatePath(pathFor(created.id));
    return ok();
  } catch {
    return invalid();
  }
}

export async function updateCampaign(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const id = idOf(data, "campaignId");
  const name = text(data, "name", 120);
  const ownerLabel = text(data, "ownerLabel", 120);
  const notes = text(data, "notes", 10000);
  if (!id || !name) return fail("campaigns.error.required");
  try {
    const lookup = await currentCampaign(id);
    if (!lookup.campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    const saved = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(campaigns).where(eq(campaigns.id, id)).for("update").limit(1);
      if (!row) return false;
      const config = objectValue(row.config);
      const nextConfig = { ...config };
      if (ownerLabel) nextConfig.ownerLabel = ownerLabel;
      else delete nextConfig.ownerLabel;
      await tx.update(campaigns).set({ name, notes: nullable(notes), config: nextConfig, updatedAt: new Date() }).where(eq(campaigns.id, id));
      return true;
    });
    if (!saved) return fail("campaigns.error.notFound");
    revalidatePath(pathFor(id));
    return ok();
  } catch {
    return invalid();
  }
}

export async function deleteCampaign(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const id = idOf(data, "campaignId");
  if (!id) return invalid();
  try {
    const lookup = await currentCampaign(id);
    if (!lookup.campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    await db.delete(campaigns).where(eq(campaigns.id, id));
    revalidatePath("/campaigns");
    return ok();
  } catch {
    return invalid();
  }
}

export async function linkGame(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const playedGameId = idOf(data, "playedGameId");
  if (!campaignId || !playedGameId) return fail("campaigns.error.required");
  try {
    const lookup = await currentCampaign(campaignId);
    const campaign = lookup.campaign;
    const [game] = await db.select().from(playedGames).where(eq(playedGames.id, playedGameId)).limit(1);
    if (!campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    if (!game) return fail("campaigns.error.notFound");
    if (campaign.gameId !== game.gameId) return fail("campaigns.error.wrongGame");
    const [completion] = await db.select({ payload: gameEvents.payload }).from(gameEvents)
      .where(and(eq(gameEvents.playedGameId, playedGameId), eq(gameEvents.kind, "game_completed")))
      .orderBy(desc(gameEvents.seq)).limit(1);
    if (!game.result || completedOutcome(completion?.payload) !== game.result) return fail("campaigns.error.incompleteGame");
    const [last] = await db.select({ n: max(campaignGames.sortOrder) }).from(campaignGames).where(eq(campaignGames.campaignId, campaignId));
    await db.insert(campaignGames).values({ campaignId, playedGameId, sortOrder: (last?.n ?? -1) + 1 });
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return fail("campaigns.error.duplicate");
  }
}

export async function unlinkGame(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const linkId = idOf(data, "linkId");
  if (!campaignId || !linkId) return invalid();
  try {
    const lookup = await currentCampaign(campaignId);
    if (!lookup.campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    await db.delete(campaignGames).where(and(eq(campaignGames.id, linkId), eq(campaignGames.campaignId, campaignId)));
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return invalid();
  }
}

export async function saveRosterUnit(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const unitId = idOf(data, "unitId");
  const name = text(data, "unitName", 160);
  const factionName = text(data, "factionName", 120);
  const notes = text(data, "notes", 4000);
  const collectionItemId = idOf(data, "collectionItemId");
  const enteredUnitId = text(data, "catalogueUnitId", 180);
  const startingRenown = text(data, "startingRenown", 20) ? Number(text(data, "startingRenown", 20)) : 0;
  const initialDate = text(data, "initialDate", 10);
  if (!campaignId || !name || !Number.isSafeInteger(startingRenown) || startingRenown < 0 || (startingRenown > 0 && !dateOf(initialDate))) return fail("campaigns.error.required");
  try {
    const lookup = await currentCampaign(campaignId);
    const campaign = lookup.campaign;
    if (!campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    if (campaign.kind === "path_to_glory" && campaign.gameId !== "aos") return invalid();
    if (campaign.kind !== "path_to_glory" && startingRenown !== 0) return invalid();
    let linkedUnitId: string | null = null;
    if (collectionItemId) {
      const [item] = await db.select({ id: collectionItems.id, unitId: collectionItems.unitId }).from(collectionItems).where(and(eq(collectionItems.id, collectionItemId), eq(collectionItems.gameId, campaign.gameId))).limit(1);
      if (!item) return fail("campaigns.error.wrongGame");
      linkedUnitId = item.unitId;
    }
    const sortRows = await db.select({ sortOrder: campaignRosterUnits.sortOrder }).from(campaignRosterUnits).where(eq(campaignRosterUnits.campaignId, campaignId));
    const values = { collectionItemId: collectionItemId ?? null, unitName: name, factionName: nullable(factionName), unitId: nullable(enteredUnitId || linkedUnitId || ""), notes: nullable(notes), updatedAt: new Date() };
    if (unitId) {
      const row = await ownedRosterUnit(unitId, campaignId);
      if (!row) return fail("campaigns.error.notFound");
      await db.update(campaignRosterUnits).set(values).where(eq(campaignRosterUnits.id, unitId));
    } else {
      await db.transaction(async (tx) => {
        const [created] = await tx.insert(campaignRosterUnits).values({ campaignId, ...values, sortOrder: (sortRows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1) }).returning({ id: campaignRosterUnits.id });
        if (startingRenown > 0) await tx.insert(campaignRenownEvents).values({ rosterUnitId: created!.id, renownDelta: startingRenown, occurredOn: initialDate });
      });
    }
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return invalid();
  }
}

export async function deleteRosterUnit(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const unitId = idOf(data, "unitId");
  if (!campaignId || !unitId) return invalid();
  try {
    const lookup = await currentCampaign(campaignId);
    const unit = await ownedRosterUnit(unitId, campaignId);
    if (!lookup.campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    if (!unit) return fail("campaigns.error.notFound");
    await db.delete(campaignRosterUnits).where(eq(campaignRosterUnits.id, unitId));
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return invalid();
  }
}

export async function addRenownEvent(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const unitId = idOf(data, "unitId");
  const delta = Number(text(data, "delta", 20));
  const occurredOn = text(data, "occurredOn", 10);
  const playedGameId = idOf(data, "playedGameId");
  const notes = text(data, "notes", 2000);
  if (!campaignId || !unitId || !Number.isSafeInteger(delta) || delta === 0 || !dateOf(occurredOn)) return fail("campaigns.error.required");
  try {
    const [unit] = await db.select({ id: campaignRosterUnits.id }).from(campaignRosterUnits).where(and(eq(campaignRosterUnits.id, unitId), eq(campaignRosterUnits.campaignId, campaignId))).limit(1);
    const lookup = await currentCampaign(campaignId);
    const campaign = lookup.campaign;
    if (!campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    if (!unit || campaign.kind !== "path_to_glory") return fail("campaigns.error.notFound");
    const applied = await db.transaction(async (tx) => {
      await tx.select({ id: campaignRosterUnits.id }).from(campaignRosterUnits).where(eq(campaignRosterUnits.id, unitId)).for("update").limit(1);
      const [current] = await tx.select({ total: sum(campaignRenownEvents.renownDelta) }).from(campaignRenownEvents).where(eq(campaignRenownEvents.rosterUnitId, unitId));
      if (Number(current?.total ?? 0) + delta < 0) return false;
      if (playedGameId) {
        const [link] = await tx.select({ id: campaignGames.id }).from(campaignGames).where(and(eq(campaignGames.campaignId, campaignId), eq(campaignGames.playedGameId, playedGameId))).limit(1);
        if (!link) return false;
      }
      await tx.insert(campaignRenownEvents).values({ rosterUnitId: unitId, renownDelta: delta, occurredOn, playedGameId: playedGameId ?? null, notes: nullable(notes) });
      return true;
    });
    if (!applied) return invalid();
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return invalid();
  }
}

export async function saveInjury(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const unitId = idOf(data, "unitId");
  const injuryId = idOf(data, "injuryId");
  const name = text(data, "name", 160);
  const description = text(data, "description", 4000);
  const incurredOn = text(data, "incurredOn", 10);
  const recoveredOn = text(data, "recoveredOn", 10);
  const incurredGameId = idOf(data, "incurredGameId");
  const isPermanent = data.get("isPermanent") === "on";
  const notes = text(data, "notes", 2000);
  if (!campaignId || !unitId || !name || !dateOf(incurredOn) || (recoveredOn && !dateOf(recoveredOn)) || (recoveredOn && recoveredOn < incurredOn)) return fail("campaigns.error.required");
  try {
    const unit = await ownedRosterUnit(unitId, campaignId);
    const lookup = await currentCampaign(campaignId);
    const campaign = lookup.campaign;
    if (!campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    if (!unit || campaign.kind !== "path_to_glory") return fail("campaigns.error.notFound");
    if (incurredGameId) {
      const [link] = await db.select({ id: campaignGames.id }).from(campaignGames).where(and(eq(campaignGames.campaignId, campaignId), eq(campaignGames.playedGameId, incurredGameId))).limit(1);
      if (!link) return fail("campaigns.error.wrongGame");
    }
    const values = { rosterUnitId: unitId, name, description: nullable(description), incurredOn, incurredGameId: incurredGameId ?? null, recoveredOn: nullable(recoveredOn), isPermanent, notes: nullable(notes) };
    if (injuryId) {
      const [existing] = await db.select().from(campaignUnitInjuries).where(and(eq(campaignUnitInjuries.id, injuryId), eq(campaignUnitInjuries.rosterUnitId, unitId))).limit(1);
      if (!existing) return fail("campaigns.error.notFound");
      await db.update(campaignUnitInjuries).set(values).where(eq(campaignUnitInjuries.id, injuryId));
    } else {
      await db.insert(campaignUnitInjuries).values(values);
    }
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return invalid();
  }
}

export async function deleteInjury(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const unitId = idOf(data, "unitId");
  const injuryId = idOf(data, "injuryId");
  if (!campaignId || !unitId || !injuryId) return invalid();
  try {
    const lookup = await currentCampaign(campaignId);
    if (!lookup.campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    if (!(await ownedRosterUnit(unitId, campaignId))) return fail("campaigns.error.notFound");
    await db.delete(campaignUnitInjuries).where(and(eq(campaignUnitInjuries.id, injuryId), eq(campaignUnitInjuries.rosterUnitId, unitId)));
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return invalid();
  }
}

export async function saveTerritory(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const territoryId = idOf(data, "territoryId");
  const name = text(data, "name", 160);
  const description = text(data, "description", 4000);
  const ownerName = text(data, "ownerName", 160);
  const acquiredOn = text(data, "acquiredOn", 10);
  const notes = text(data, "notes", 2000);
  if (!campaignId || !name || (acquiredOn && !dateOf(acquiredOn))) return fail("campaigns.error.required");
  try {
    const lookup = await currentCampaign(campaignId);
    const campaign = lookup.campaign;
    if (!campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    if (campaign.kind !== "path_to_glory") return fail("campaigns.error.notFound");
    const values = { campaignId, name, description: nullable(description), ownerName: nullable(ownerName), acquiredOn: nullable(acquiredOn), notes: nullable(notes), updatedAt: new Date() };
    if (territoryId) {
      const [row] = await db.select().from(campaignTerritories).where(and(eq(campaignTerritories.id, territoryId), eq(campaignTerritories.campaignId, campaignId))).limit(1);
      if (!row) return fail("campaigns.error.notFound");
      await db.update(campaignTerritories).set(values).where(eq(campaignTerritories.id, territoryId));
    } else {
      await db.insert(campaignTerritories).values(values);
    }
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return fail("campaigns.error.duplicate");
  }
}

export async function deleteTerritory(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const territoryId = idOf(data, "territoryId");
  if (!campaignId || !territoryId) return invalid();
  try {
    const lookup = await currentCampaign(campaignId);
    if (!lookup.campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    await db.delete(campaignTerritories).where(and(eq(campaignTerritories.id, territoryId), eq(campaignTerritories.campaignId, campaignId)));
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return invalid();
  }
}

export async function saveRuleValue(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const index = text(data, "ruleIndex", 10);
  const name = text(data, "name", 160);
  const value = text(data, "value", 2000);
  const source = text(data, "source", 500);
  if (!campaignId || !name || !value) return fail("campaigns.error.required");
  try {
    const lookup = await currentCampaign(campaignId);
    if (!lookup.campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    const row = { name, value, ...(source ? { source } : {}) };
    const editIndex = index ? Number(index) : null;
    if (editIndex !== null && (!Number.isInteger(editIndex) || editIndex < 0)) return invalid();
    const status = await mutateRules(campaignId, (rules) => {
      const next = [...rules];
      if (editIndex !== null) {
        if (editIndex >= next.length) return null;
        next[editIndex] = row;
      } else next.push(row);
      return next;
    });
    if (status === "notFound") return fail("campaigns.error.notFound");
    if (status === "invalid") return invalid();
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return invalid();
  }
}

export async function deleteRuleValue(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const index = Number(text(data, "ruleIndex", 10));
  if (!campaignId || !Number.isInteger(index) || index < 0) return invalid();
  try {
    const lookup = await currentCampaign(campaignId);
    if (!lookup.campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    const status = await mutateRules(campaignId, (rules) => {
      if (index >= rules.length) return null;
      return rules.filter((_, i) => i !== index);
    });
    if (status === "notFound") return fail("campaigns.error.notFound");
    if (status === "invalid") return invalid();
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return invalid();
  }
}

export async function importConfig(_previous: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  if (!owner.ok) return fail("campaigns.error.auth");
  const campaignId = idOf(data, "campaignId");
  const file = data.get("configFile");
  if (!campaignId || typeof File === "undefined" || !(file instanceof File) || file.size === 0 || file.size > 1_000_000) return invalid();
  try {
    const lookup = await currentCampaign(campaignId);
    if (!lookup.campaign) return fail(lookup.error ?? "campaigns.error.notFound");
    const parsed = JSON.parse(await file.text()) as { rules?: unknown };
    if (!Array.isArray(parsed?.rules) || parsed.rules.length > 200) return fail("campaigns.importConfigError");
    const rules = parsed.rules.map((row) => {
      if (!row || typeof row !== "object") throw new Error("invalid");
      const item = row as Record<string, unknown>;
      if (typeof item.name !== "string" || !item.name.trim() || typeof item.value !== "string" || !item.value.trim()) throw new Error("invalid");
      return { name: item.name.trim().slice(0, 160), value: item.value.trim().slice(0, 2000), ...(typeof item.source === "string" && item.source.trim() ? { source: item.source.trim().slice(0, 500) } : {}) };
    });
    const status = await mutateRules(campaignId, () => rules);
    if (status === "notFound") return fail("campaigns.error.notFound");
    if (status === "invalid") return invalid();
    revalidatePath(pathFor(campaignId));
    return ok();
  } catch {
    return fail("campaigns.importConfigError");
  }
}
