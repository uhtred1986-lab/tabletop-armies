// What the duel home (saga world) shows, derived from the owner's saved strike team, the pack it was built
// against and the recent games. Pure: no database, no React (CLAUDE.md rule 2). Everything here is computed per
// request and never stored (rule 3). Names come only from the owner's pack; a unit the pack does not know keeps
// its saved id, nothing is invented (rule 10).
import type { Issue } from "../types";
import { listSelections } from "../validation";
import type { SpRole } from "./validate";

/** The parts of a saved list the duel home reads (structurally the home's list row). */
export interface DuelListInput {
  id: number;
  name: string;
  packId: number | null;
  definition: Record<string, unknown>;
  status: "complete" | "incomplete";
  issues: Issue[];
}

/** The parts of a recorded game the duel home reads. */
export interface DuelGameInput {
  id: number;
  opponent: string | null;
  playedOn: string;
  result: "win" | "loss" | "draw" | null;
}

export interface DuelInput {
  /** Most recently changed first. */
  lists: DuelListInput[];
  pack?: { id: number; content: unknown };
  /** Newest first. */
  recentGames: DuelGameInput[];
  activeGame?: DuelGameInput;
}

export interface DuelUnit {
  id: string;
  /** The pack's name for the unit; null when the pack does not know the id. */
  name: string | null;
  role: SpRole | null;
  /** Squad points the pack gives the unit (granted by a Primary, cost of the others). */
  sp: number | null;
}

export interface DuelSquad {
  units: DuelUnit[];
  /** Squad points from the Primary and spent by the rest; null when the pack does not say. */
  points: { budget: number; spent: number } | null;
}

export interface DuelTeam {
  listId: number;
  name: string;
  status: "complete" | "incomplete";
  errors: number;
  warnings: number;
  /** The first issue to name on the home, errors before warnings. */
  firstIssue?: Issue;
  squads: DuelSquad[];
}

export interface DuelResult {
  gameId: number;
  opponent: string | null;
  playedOn: string;
  result: "win" | "loss" | "draw";
}

export interface DuelView {
  /** The latest strike team, if the owner saved one. */
  team?: DuelTeam;
  /** The opponent on the right: the running game's, else the most recent one named; null when none is known. */
  opponent: string | null;
  /** A game still running. */
  active?: { gameId: number; opponent: string | null; playedOn: string };
  /** The newest finished game. */
  lastResult?: DuelResult;
  /** Results of the finished games among the recent ones. */
  record: { win: number; loss: number; draw: number; games: number };
}

type Data = Record<string, unknown>;
const data = (v: unknown): Data => (v && typeof v === "object" ? (v as Data) : {});
const ROLES: SpRole[] = ["primary", "secondary", "supporting"];
const isRole = (v: unknown): v is SpRole => typeof v === "string" && (ROLES as string[]).includes(v);

/** The pack's units by id; empty when the list was not built against this pack. */
export const packUnits = (pack: DuelInput["pack"], packId: number | null): Map<string, Data> => {
  if (!pack || packId === null || pack.id !== packId) return new Map();
  const units = data(data(pack.content).catalogue).units;
  return new Map((Array.isArray(units) ? units.map(data) : []).filter((u) => typeof u.id === "string").map((u) => [u.id as string, u]));
};

/** The squads as saved, each unit resolved through the pack and ordered Primary, Secondary, Supporting. */
export const teamSquads = (definition: Record<string, unknown>, units: Map<string, Data>): DuelSquad[] => {
  const squads = data(listSelections(definition).selections).squads;
  if (!Array.isArray(squads)) return [];
  return squads.map((raw) => {
    const ids = data(raw).unitIds;
    const resolved: DuelUnit[] = (Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === "string").map((id) => {
      const unit = units.get(id);
      return {
        id,
        name: typeof unit?.name === "string" && unit.name.trim() ? unit.name : null,
        role: isRole(unit?.role) ? unit.role : null,
        sp: typeof unit?.squadPoints === "number" ? unit.squadPoints : null,
      };
    });
    const rank = (u: DuelUnit) => (u.role ? ROLES.indexOf(u.role) : ROLES.length);
    const ordered = resolved.map((u, i) => ({ u, i })).sort((a, b) => rank(a.u) - rank(b.u) || a.i - b.i).map(({ u }) => u);
    const primary = ordered.find((u) => u.role === "primary");
    const others = ordered.filter((u) => u !== primary);
    const budget = primary?.sp ?? null;
    const known = budget !== null && others.every((u) => u.sp !== null);
    return {
      units: ordered,
      points: known ? { budget, spent: others.reduce((n, u) => n + (u.sp ?? 0), 0) } : null,
    };
  });
};

export const duelView = (input: DuelInput): DuelView => {
  const latest = input.lists[0];
  const team: DuelTeam | undefined = latest && {
    listId: latest.id,
    name: latest.name,
    status: latest.status,
    errors: latest.issues.filter((i) => i.severity === "error").length,
    warnings: latest.issues.filter((i) => i.severity !== "error").length,
    firstIssue: latest.issues.find((i) => i.severity === "error") ?? latest.issues[0],
    squads: teamSquads(latest.definition, packUnits(input.pack, latest.packId)),
  };
  const finished = input.recentGames.filter((g): g is DuelGameInput & { result: DuelResult["result"] } => g.result !== null);
  const last = finished[0];
  const named = (name: string | null | undefined) => (name && name.trim() ? name.trim() : null);
  const opponent = input.activeGame
    ? named(input.activeGame.opponent)
    : named(input.recentGames.find((g) => named(g.opponent))?.opponent);
  return {
    team,
    opponent,
    active: input.activeGame && { gameId: input.activeGame.id, opponent: named(input.activeGame.opponent), playedOn: input.activeGame.playedOn },
    lastResult: last && { gameId: last.id, opponent: named(last.opponent), playedOn: last.playedOn, result: last.result },
    record: {
      win: finished.filter((g) => g.result === "win").length,
      loss: finished.filter((g) => g.result === "loss").length,
      draw: finished.filter((g) => g.result === "draw").length,
      games: finished.length,
    },
  };
};
