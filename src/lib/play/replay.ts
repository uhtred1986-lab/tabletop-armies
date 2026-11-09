import type { GameModule, WorldId } from "@/games/types";

export type PlaySide = "owner" | "opponent";

export type PlayModuleSnapshot = {
  id: GameModule["id"];
  world: WorldId;
  name: string;
  rounds?: number;
  phases: { id: string; label: string }[];
  trackers: { id: string; label: string; kind: "counter" | "toggle" | "resource" | "track"; scope: "game" | "side" | "unit" | "round" | "side-round"; min?: number; max?: number; options?: { id: string; label: string }[] }[];
  tools: { orderDeck?: boolean; struggleTrack?: boolean };
  /** Frozen from the module's playSetup (labels already translated). */
  setup?: {
    rollOffs: { id: string; label: string; help: string }[];
    roundPicks: { id: string; label: string }[];
    pools: { id: string; label: string; gainedTracker: string; spentTracker: string }[];
    extraPointsTracker?: string;
  };
  orderOptions: { id: string; label: string }[];
  labels: { round: string; phase: string; owner: string; opponent: string; nextPhase: string; nextRound: string; changeSide: string; undo: string; activeSide: string; trackers: string; orderDeck: string; struggle: string; timer: string; value: string; add: string; remove: string; game: string; actions: string; sync: string; noGames: string; reconnect: string; record: string };
};

/** A battleplan as frozen at the start of a game (from the owner's pack; never from code). */
export type PlayBattleplan = {
  id: string;
  name: string;
  number?: number;
  map?: { width: number; height: number; territories: { side: "attacker" | "defender" | "neutral"; points: [number, number][] }[]; objectives: { x: number; y: number; label?: string }[] };
  scoring: { id: string; label: string; points: number }[];
};

/** What the guided pre-game decided (issue #9). Frozen with the start so later pack changes never rewrite a game. */
export type PlaySetupSnapshot = {
  battleplan?: PlayBattleplan;
  tactics: { id: string; name: string; points?: number }[];
  /** Roll-off id → the side that won it (e.g. attacker, priority). */
  rollOffs: Record<string, PlaySide>;
  photoReminder?: boolean;
};

export type PlayStartSnapshot = {
  schemaVersion: 1;
  gameId: GameModule["id"];
  module?: PlayModuleSnapshot;
  modeId?: string;
  setup?: PlaySetupSnapshot;
  sides: {
    owner: { factionId?: string; listIds: number[]; lists: { id?: number; name: string; selections: unknown }[]; units: { id?: string; name: string }[] };
    opponent: { name: string; factionId?: string; listName?: string; units: { id?: string; name: string }[] };
  };
};

export type PlayEvent = { seq: number; kind: string; payload: Record<string, unknown> };

export type TrackerValue = {
  trackerId: string;
  scope: "game" | "side" | "unit" | "round" | "side-round";
  side?: PlaySide;
  unitId?: string;
  round?: number;
  value: number | boolean | string;
};

export type PlayState = {
  start: PlayStartSnapshot;
  round: number;
  phaseIndex: number;
  activeSide: PlaySide;
  trackers: Record<string, number | boolean | string>;
  orders: string[];
  struggle: Record<string, number | string | boolean>;
  timer: { status: "idle" | "running" | "paused"; startedAt?: number; elapsedMs: number };
  completed?: "win" | "loss" | "draw";
  /** "round:pickId" → side (who won priority, who went first). */
  picks: Record<string, PlaySide>;
  /** "side:round:scoringId" → scored that round. */
  scores: Record<string, boolean>;
  /** "side:round" → the tactic chosen that round and whether it was achieved. */
  tactics: Record<string, { tacticId: string | null; achieved: boolean }>;
};

export type ReplayResult = { ok: true; state: PlayState } | { ok: false; reason: "missing-start" | "bad-sequence" | "bad-event" };

const keyFor = (v: Pick<TrackerValue, "trackerId" | "scope" | "side" | "unitId" | "round">): string =>
  [v.scope, v.side ?? "", v.unitId ?? "", v.round ?? "", v.trackerId].join(":");

const isSide = (v: unknown): v is PlaySide => v === "owner" || v === "opponent";

function initialState(start: PlayStartSnapshot): PlayState {
  return { start, round: 1, phaseIndex: 0, activeSide: "owner", trackers: {}, orders: [], struggle: {}, timer: { status: "idle", elapsedMs: 0 }, picks: {}, scores: {}, tactics: {} };
}

/** Replay is deliberately mechanical: it applies recorded table actions and enforces no game rules. */
export function replay(events: PlayEvent[], game: Pick<GameModule, "phases" | "rounds">): ReplayResult {
  if (!events.length || events[0]?.kind !== "game_started") return { ok: false, reason: "missing-start" };
  if (events.some((event, index) => event.seq !== index + 1)) return { ok: false, reason: "bad-sequence" };
  const start = events[0]?.payload.snapshot;
  if (!isStartSnapshot(start)) return { ok: false, reason: "bad-event" };
  const state = initialState(start);
  const phaseCount = start.module?.phases.length ?? game.phases.length;
  const roundLimit = start.module?.rounds ?? game.rounds;

  for (const event of events.slice(1)) {
    const payload = event.payload;
    switch (event.kind) {
      case "tracker_set": {
        const tracker = payload.tracker;
        if (!isTrackerValue(tracker) || !validTracker(start, tracker, state.round, roundLimit)) return { ok: false, reason: "bad-event" };
        state.trackers[keyFor(tracker)] = tracker.value;
        break;
      }
      case "phase_advanced": {
        if (!Number.isInteger(payload.phaseIndex) || Number(payload.phaseIndex) !== state.phaseIndex + 1 || Number(payload.phaseIndex) >= phaseCount || !isSide(payload.activeSide)) {
          return { ok: false, reason: "bad-event" };
        }
        state.phaseIndex = Number(payload.phaseIndex);
        if (isSide(payload.activeSide)) state.activeSide = payload.activeSide;
        break;
      }
      case "round_advanced": {
        const round = Number(payload.round);
        if (!Number.isInteger(round) || round !== state.round + 1 || (roundLimit !== undefined && round > roundLimit) || state.phaseIndex !== phaseCount - 1 || !isSide(payload.activeSide)) return { ok: false, reason: "bad-event" };
        state.round = round;
        state.phaseIndex = 0;
        state.activeSide = payload.activeSide;
        break;
      }
      case "side_changed":
        if (!isSide(payload.activeSide)) return { ok: false, reason: "bad-event" };
        state.activeSide = payload.activeSide;
        break;
      case "order_deck_set": {
        if (!start.module?.tools.orderDeck || !Array.isArray(payload.orderIds) || !payload.orderIds.every((id) => typeof id === "string") ||
          (start.module.orderOptions.length > 0 && !payload.orderIds.every((id) => start.module!.orderOptions.some((order) => order.id === id)))) return { ok: false, reason: "bad-event" };
        state.orders = [...payload.orderIds];
        break;
      }
      case "struggle_set": {
        if (!start.module?.tools.struggleTrack || typeof payload.key !== "string" || !payload.key.trim() || !isScalar(payload.value)) return { ok: false, reason: "bad-event" };
        state.struggle[payload.key] = payload.value;
        break;
      }
      case "round_pick_set": {
        const round = Number(payload.round);
        if (!validRound(round, state.round) || typeof payload.pickId !== "string" || !start.module?.setup?.roundPicks.some((pick) => pick.id === payload.pickId) || !isSide(payload.side)) return { ok: false, reason: "bad-event" };
        state.picks[`${round}:${payload.pickId}`] = payload.side;
        break;
      }
      case "score_set": {
        const round = Number(payload.round);
        if (!validRound(round, state.round) || !isSide(payload.side) || typeof payload.scoringId !== "string" || typeof payload.scored !== "boolean" ||
          !start.setup?.battleplan?.scoring.some((rule) => rule.id === payload.scoringId)) return { ok: false, reason: "bad-event" };
        state.scores[`${payload.side}:${round}:${payload.scoringId}`] = payload.scored;
        break;
      }
      case "tactic_set": {
        const round = Number(payload.round);
        const tacticId = payload.tacticId;
        if (!validRound(round, state.round) || !isSide(payload.side) || typeof payload.achieved !== "boolean" ||
          !(tacticId === null || (typeof tacticId === "string" && start.setup?.tactics.some((tactic) => tactic.id === tacticId))) ||
          (tacticId === null && payload.achieved)) return { ok: false, reason: "bad-event" };
        state.tactics[`${payload.side}:${round}`] = { tacticId: tacticId as string | null, achieved: payload.achieved };
        break;
      }
      case "game_completed":
        if ((payload.result !== "win" && payload.result !== "loss" && payload.result !== "draw") ||
          (payload.result === "draw" ? payload.winner !== "draw" : payload.winner !== (payload.result === "win" ? "owner" : "opponent"))) return { ok: false, reason: "bad-event" };
        state.completed = payload.result;
        break;
      case "game_note":
        if (typeof payload.text !== "string" || (payload.kind !== undefined && typeof payload.kind !== "string")) return { ok: false, reason: "bad-event" };
        break;
      case "timer_started":
        if (typeof payload.startedAt !== "number" || !Number.isFinite(payload.startedAt) || typeof payload.elapsedMs !== "number" || !Number.isFinite(payload.elapsedMs) || payload.elapsedMs < 0) return { ok: false, reason: "bad-event" };
        state.timer = { status: "running", startedAt: payload.startedAt, elapsedMs: payload.elapsedMs };
        break;
      case "timer_stopped":
        if (typeof payload.elapsedMs !== "number" || !Number.isFinite(payload.elapsedMs) || payload.elapsedMs < 0) return { ok: false, reason: "bad-event" };
        state.timer = { status: "paused", elapsedMs: payload.elapsedMs };
        break;
      case "timer_reset":
        state.timer = { status: "idle", elapsedMs: 0 };
        break;
      default:
        return { ok: false, reason: "bad-event" };
    }
  }
  return { ok: true, state };
}

/** Round events may correct any round already reached, never a future one. */
function validRound(round: number, current: number): boolean {
  return Number.isInteger(round) && round >= 1 && round <= current;
}

export function isStartSnapshot(value: unknown): value is PlayStartSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PlayStartSnapshot>;
  if (v.schemaVersion !== 1 || typeof v.gameId !== "string" || !v.sides?.owner || !v.sides?.opponent) return false;
  const { owner, opponent } = v.sides;
  if (!Array.isArray(owner.listIds) || !owner.listIds.every(Number.isInteger) || !Array.isArray(owner.lists) ||
    !owner.lists.every((list) => !!list && typeof list.name === "string" && "selections" in list) || !validUnits(owner.units) ||
    typeof opponent.name !== "string" || !validUnits(opponent.units)) return false;
  if (new Set(owner.listIds).size !== owner.listIds.length || owner.lists.some((list) => list.id !== undefined && (!Number.isInteger(list.id) || !owner.listIds.includes(list.id)))) return false;
  if (v.setup !== undefined && !validSetup(v.setup)) return false;
  if (v.module !== undefined) {
    const frozenGame = v.module;
    if (!frozenGame || frozenGame.id !== v.gameId || typeof frozenGame.name !== "string" || !Array.isArray(frozenGame.phases) || !frozenGame.phases.length ||
      !frozenGame.phases.every((phase) => !!phase && typeof phase.id === "string" && typeof phase.label === "string") ||
      new Set(frozenGame.phases.map((phase) => phase.id)).size !== frozenGame.phases.length || !Array.isArray(frozenGame.trackers) ||
      !frozenGame.trackers.every(validTrackerDefinition) || new Set(frozenGame.trackers.map((tracker) => tracker.id)).size !== frozenGame.trackers.length ||
      !Array.isArray(frozenGame.orderOptions) || !frozenGame.orderOptions.every((order) => !!order && typeof order.id === "string" && typeof order.label === "string") ||
      !frozenGame.tools || typeof frozenGame.tools !== "object" || Object.values(frozenGame.tools).some((enabled) => typeof enabled !== "boolean") ||
      !frozenGame.labels || typeof frozenGame.labels !== "object" || Array.isArray(frozenGame.labels) || !Object.values(frozenGame.labels).every((label) => typeof label === "string") ||
      (frozenGame.rounds !== undefined && (!Number.isInteger(frozenGame.rounds) || frozenGame.rounds < 1)) ||
      (frozenGame.setup !== undefined && !validModuleSetup(frozenGame.setup))) return false;
  }
  return true;
}

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isNumberAtLeast = (value: unknown, min: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min;

function validModuleSetup(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const setup = value as NonNullable<PlayModuleSnapshot["setup"]>;
  return Array.isArray(setup.rollOffs) && setup.rollOffs.every((item) => !!item && isText(item.id) && typeof item.label === "string" && typeof item.help === "string") &&
    Array.isArray(setup.roundPicks) && setup.roundPicks.every((item) => !!item && isText(item.id) && typeof item.label === "string") &&
    Array.isArray(setup.pools) && setup.pools.every((item) => !!item && isText(item.id) && typeof item.label === "string" && isText(item.gainedTracker) && isText(item.spentTracker)) &&
    (setup.extraPointsTracker === undefined || isText(setup.extraPointsTracker));
}

function validSetup(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const setup = value as PlaySetupSnapshot;
  if (!Array.isArray(setup.tactics) || !setup.tactics.every((tactic) => !!tactic && isText(tactic.id) && isText(tactic.name) && (tactic.points === undefined || isNumberAtLeast(tactic.points, 0)))) return false;
  if (new Set(setup.tactics.map((tactic) => tactic.id)).size !== setup.tactics.length) return false;
  if (!setup.rollOffs || typeof setup.rollOffs !== "object" || Array.isArray(setup.rollOffs) || !Object.values(setup.rollOffs).every(isSide)) return false;
  if (setup.photoReminder !== undefined && typeof setup.photoReminder !== "boolean") return false;
  const plan = setup.battleplan;
  if (plan === undefined) return true;
  if (!plan || !isText(plan.id) || !isText(plan.name) || (plan.number !== undefined && !(Number.isInteger(plan.number) && plan.number > 0))) return false;
  if (!Array.isArray(plan.scoring) || !plan.scoring.every((rule) => !!rule && isText(rule.id) && isText(rule.label) && Number.isInteger(rule.points) && rule.points >= 0)) return false;
  if (new Set(plan.scoring.map((rule) => rule.id)).size !== plan.scoring.length) return false;
  if (plan.map === undefined) return true;
  const map = plan.map;
  const inBoard = (x: unknown, y: unknown) => isNumberAtLeast(x, 0) && isNumberAtLeast(y, 0) && x <= map.width && y <= map.height;
  return !!map && isNumberAtLeast(map.width, 1) && isNumberAtLeast(map.height, 1) &&
    Array.isArray(map.territories) && map.territories.every((area) => !!area && ["attacker", "defender", "neutral"].includes(area.side) && Array.isArray(area.points) && area.points.length >= 3 && area.points.every((p) => Array.isArray(p) && p.length === 2 && inBoard(p[0], p[1]))) &&
    Array.isArray(map.objectives) && map.objectives.every((objective) => !!objective && inBoard(objective.x, objective.y) && (objective.label === undefined || typeof objective.label === "string"));
}

function isScalar(value: unknown): value is number | boolean | string {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function isTrackerValue(value: unknown): value is TrackerValue {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<TrackerValue>;
  return typeof v.trackerId === "string" && (v.scope === "game" || v.scope === "side" || v.scope === "unit" || v.scope === "round" || v.scope === "side-round") &&
    isScalar(v.value) && (v.side === undefined || isSide(v.side)) && (v.unitId === undefined || typeof v.unitId === "string") &&
    (v.round === undefined || Number.isInteger(v.round));
}

function validUnits(value: unknown): value is { id?: string; name: string }[] {
  if (!Array.isArray(value) || !value.every((unit) => !!unit && typeof unit === "object" && typeof unit.name === "string" && (unit.id === undefined || typeof unit.id === "string"))) return false;
  const ids = value.map((unit) => unit.id).filter((id): id is string => typeof id === "string");
  return new Set(ids).size === ids.length;
}

function validTrackerDefinition(value: unknown): value is PlayModuleSnapshot["trackers"][number] {
  if (!value || typeof value !== "object") return false;
  const tracker = value as Partial<PlayModuleSnapshot["trackers"][number]>;
  return typeof tracker.id === "string" && typeof tracker.label === "string" &&
    (tracker.kind === "counter" || tracker.kind === "toggle" || tracker.kind === "resource" || tracker.kind === "track") &&
    (tracker.scope === "game" || tracker.scope === "side" || tracker.scope === "unit" || tracker.scope === "round" || tracker.scope === "side-round") &&
    (tracker.min === undefined || (typeof tracker.min === "number" && Number.isFinite(tracker.min))) &&
    (tracker.max === undefined || (typeof tracker.max === "number" && Number.isFinite(tracker.max))) &&
    (tracker.min === undefined || tracker.max === undefined || tracker.min <= tracker.max) &&
    (tracker.options === undefined || (Array.isArray(tracker.options) && tracker.options.every((option) => !!option && typeof option.id === "string" && typeof option.label === "string")));
}

function validTracker(start: PlayStartSnapshot, value: TrackerValue, currentRound: number, rounds?: number): boolean {
  const definition = start.module?.trackers.find((tracker) => tracker.id === value.trackerId);
  if (!definition || definition.scope !== value.scope) return false;
  if (value.scope === "side" && (!value.side || value.unitId !== undefined || value.round !== undefined)) return false;
  if (value.scope === "unit" && (!value.side || !value.unitId || !start.sides[value.side].units.some((unit) => unit.id === value.unitId) || value.round !== undefined)) return false;
  if (value.scope === "game" && (value.side !== undefined || value.unitId !== undefined || value.round !== undefined)) return false;
  if (value.scope === "side-round" && (!value.side || value.unitId !== undefined || value.round === undefined || !validRound(value.round, currentRound))) return false;
  if (value.scope === "round" && (value.side !== undefined || value.unitId !== undefined || value.round !== currentRound || (rounds !== undefined && currentRound > rounds))) return false;
  if (definition.kind === "toggle") return typeof value.value === "boolean";
  if (definition.kind === "counter" || definition.kind === "resource") {
    return typeof value.value === "number" && Number.isFinite(value.value) && (definition.min === undefined || value.value >= definition.min) && (definition.max === undefined || value.value <= definition.max);
  }
  return typeof value.value === "string" && (!definition.options?.length || definition.options.some((option) => option.id === value.value));
}

export const trackerKey = keyFor;
