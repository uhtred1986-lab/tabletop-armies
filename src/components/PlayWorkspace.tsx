"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import type { CataloguePack, ListValidationResult } from "@/games/types";
import type { Locale } from "@/i18n";
import { applyPlayOperation, loadPlayEvents, startGame } from "@/app/(app)/play/actions";
import { featureTranslator } from "@/i18n/features/play";
import { enqueueOperation, listQueuedOperations, loadSnapshot, markOperation, payloadHash, saveSnapshot, setActiveOfflineOwner, type OfflineOperation } from "@/lib/play/offline-store";
import { applyQueuedOperations, nextOperationSequence, replayPlay, trackerValue } from "@/lib/play/model";
import type { PlayEvent, PlayModuleSnapshot, PlaySide, PlayStartSnapshot, TrackerValue } from "@/lib/play/replay";

type GameList = { id: number; name: string; definition: Record<string, unknown>; validation: ListValidationResult; variantId: string; packId: number | null };
type ListVariant = { id: string; labelKey: string };
type PackView = { id: number; sourceDate: string; revision: string; content: CataloguePack };
type HistoryRow = { id: number; opponent: string; playedOn: string; result: "win" | "loss" | "draw" | null; listIds: number[] };
type Props = { owner: string; locale: Locale; game: PlayModuleSnapshot; lists: GameList[]; listVariants: ListVariant[]; packs: PackView[]; currentPack?: PackView; history: HistoryRow[]; selectedGame?: HistoryRow; initialEvents: PlayEvent[]; opponents: { id: string; name: string }[] };

const subscribeOnline = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};
const getOnlineSnapshot = () => navigator.onLine;
const getServerOnlineSnapshot = () => true;

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const withoutUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).map(([key, item]) => [key, withoutUndefined(item)]));
  return value;
};
const unique = <T,>(items: T[], key: (item: T) => string) => [...new Map(items.map((item) => [key(item), item])).values()];

function unitsForList(list: GameList, pack?: PackView): { id: string; name: string }[] {
  const known = new Map<string, string>();
  const catalogue = record(pack?.content.catalogue);
  if (Array.isArray(catalogue.units)) for (const item of catalogue.units) {
    const row = record(item);
    if (typeof row.id === "string" && typeof row.name === "string") known.set(row.id, row.name);
  }
  const found: { id?: string; name: string }[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    for (const key of ["unitId", "modelId"]) {
      const id = row[key];
      if (typeof id === "string") {
        const name = typeof row.name === "string" ? row.name : known.get(id);
        if (name) found.push({ id, name });
      }
    }
    for (const [key, item] of Object.entries(row)) {
      if (Array.isArray(item) && /(unit|character|model)Ids$/.test(key)) {
        for (const id of item) if (typeof id === "string" && known.has(id)) found.push({ id, name: known.get(id)! });
      } else visit(item);
    }
  };
  visit(list.definition.selections);
  const counts = new Map<string, number>();
  return found.map((unit) => {
    const key = unit.id ?? unit.name;
    const occurrence = (counts.get(key) ?? 0) + 1;
    counts.set(key, occurrence);
    return { id: `${list.id}:${key}:${occurrence}`, name: unit.name };
  });
}

function trackerInitialValue(tracker: PlayModuleSnapshot["trackers"][number]): number | boolean | string {
  if (tracker.kind === "toggle") return false;
  if (tracker.kind === "track") return tracker.options?.[0]?.id ?? "";
  return 0;
}

function phaseFor(game: PlayModuleSnapshot, index: number) { return game.phases[Math.max(0, Math.min(index, game.phases.length - 1))]; }

export function PlayWorkspace(props: Props) {
  const lastEvent = props.initialEvents.at(-1);
  const key = [props.owner, props.game.id, props.selectedGame?.id ?? "setup", lastEvent?.seq ?? 0, lastEvent?.kind ?? ""].join(":");
  return <PlayWorkspaceSession key={key} {...props} />;
}

function PlayWorkspaceSession(props: Props) {
  const { owner, locale, game, lists, packs, currentPack, history, selectedGame, initialEvents, opponents } = props;
  const t = featureTranslator(locale);
  const router = useRouter();
  const [confirmedEvents, setConfirmedEvents] = useState(initialEvents);
  const confirmedEventsRef = useRef(initialEvents);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [status, setStatus] = useState("");
  const [syncing, setSyncing] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const [opponentName, setOpponentName] = useState("");
  const [opponentFaction, setOpponentFaction] = useState("");
  const [opponentListName, setOpponentListName] = useState("");
  const [ownListIds, setOwnListIds] = useState<number[]>([]);
  const [opponentUnitIds, setOpponentUnitIds] = useState<string[]>([]);
  const [manualOpponentUnits, setManualOpponentUnits] = useState("");
  const [starting, setStarting] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [timerNow, setTimerNow] = useState(0);
  const [diceCount, setDiceCount] = useState(1);
  const [damageInput, setDamageInput] = useState({ attacks: 1, dice: 1, successes: 1, damage: 1 });
  const [note, setNote] = useState("");
  const [orderId, setOrderId] = useState("");
  const [manualOrderId, setManualOrderId] = useState("");
  const [struggleKey, setStruggleKey] = useState("");
  const [struggleValue, setStruggleValue] = useState("");
  const pendingOps = operations.filter((operation) => operation.status === "pending");
  const conflictOps = operations.filter((operation) => operation.status === "conflict" || operation.status === "rejected");
  const viewEvents = useMemo(() => applyQueuedOperations(confirmedEvents, operations), [confirmedEvents, operations]);
  const state = useMemo(() => replayPlay(viewEvents, game), [viewEvents, game]);
  const units = useMemo(() => ({
    owner: selectedGame ? startSnapshotFromEvent(confirmedEvents)?.sides.owner.units ?? [] : [],
    opponent: selectedGame ? startSnapshotFromEvent(confirmedEvents)?.sides.opponent.units ?? [] : [],
  }), [selectedGame, confirmedEvents]);
  const serverSyncRef = useRef<() => Promise<void>>(async () => {});
  const operationTail = useRef<Promise<void>>(Promise.resolve());

  const refreshFromServer = useCallback(async (gameId: number): Promise<PlayEvent[] | null> => {
    const result = await loadPlayEvents(gameId);
    if (!result.ok) return null;
    confirmedEventsRef.current = result.value;
    setConfirmedEvents(result.value);
    const cached = startSnapshotFromEvent(result.value);
    if (cached) await saveSnapshot({ owner, playedGameId: gameId, gameId: game.id, eventSeq: result.value.at(-1)?.seq ?? 0, events: result.value });
    return result.value;
  }, [game.id, owner]);

  const refreshOperations = useCallback(async (gameId: number) => {
    const queued = await listQueuedOperations(owner, gameId);
    setOperations(queued);
    return queued;
  }, [owner]);

  const syncQueue = useCallback(async () => {
    if (!selectedGame || !navigator.onLine || syncing || conflictOps.length > 0) return;
    setSyncing(true);
    let shouldRefresh = false;
    try {
      const queue = await listQueuedOperations(owner, selectedGame.id);
      for (const operation of queue) {
        const result = await applyPlayOperation({
          operationId: operation.id,
          playedGameId: operation.playedGameId,
          operationKind: operation.operationKind,
          expectedSeq: operation.expectedSeq,
          payloadHash: operation.payloadHash,
          kind: operation.kind,
          payload: operation.payload,
        });
        if (!result.ok) { setStatus(t("play.syncWaiting")); break; }
        if (result.value.outcome === "accepted") {
          await markOperation(operation.id, "delete");
          if (operation.operationKind === "append" && operation.kind && operation.payload) {
            confirmedEventsRef.current = [...confirmedEventsRef.current, { seq: operation.expectedSeq, kind: operation.kind, payload: operation.payload }];
          } else if (operation.operationKind === "undo") {
            confirmedEventsRef.current = confirmedEventsRef.current.filter((event) => event.seq !== operation.expectedSeq);
          }
          shouldRefresh = true;
          continue;
        }
        await markOperation(operation.id, result.value.outcome);
        shouldRefresh = true;
        setStatus(result.value.outcome === "conflict" ? t("play.syncConflict") : t("play.syncRejected"));
        break;
      }
      if (shouldRefresh) await refreshFromServer(selectedGame.id);
      await refreshOperations(selectedGame.id);
      if (shouldRefresh && !(await listQueuedOperations(owner, selectedGame.id)).length) setStatus(t("play.syncComplete"));
    } catch {
      setStatus(t("play.syncWaiting"));
    } finally {
      setSyncing(false);
    }
  }, [conflictOps.length, owner, refreshFromServer, refreshOperations, selectedGame, syncing, t]);
  useEffect(() => { serverSyncRef.current = syncQueue; }, [syncQueue]);

  useEffect(() => { void setActiveOfflineOwner(owner).catch(() => undefined); }, [owner]);
  useEffect(() => {
    if (!selectedGame) return;
    const gameId = selectedGame.id;
    let alive = true;
    void loadSnapshot(owner, gameId).then(async () => {
      if (!alive) return;
      await refreshOperations(gameId);
      if (navigator.onLine) {
        await refreshFromServer(gameId);
        void serverSyncRef.current();
      }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [initialEvents, owner, refreshFromServer, refreshOperations, selectedGame]);
  useEffect(() => {
    const online = () => { void serverSyncRef.current(); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
  useEffect(() => {
    const interval = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  async function append(kind: string, payload: Record<string, unknown>) {
    const task = operationTail.current.then(async () => {
      if (!selectedGame) return;
      const queued = await listQueuedOperations(owner, selectedGame.id);
      if (queued.some((operation) => operation.status !== "pending")) { setStatus(t("play.resolveConflictFirst")); return; }
      const { expectedSeq } = nextOperationSequence(confirmedEventsRef.current, queued);
      const operation = await enqueueOperation({ owner, playedGameId: selectedGame.id, operationKind: "append", expectedSeq, kind, payload });
      setOperations((current) => [...current, operation]);
      if (navigator.onLine) void serverSyncRef.current();
      else setStatus(t("play.offline"));
    });
    operationTail.current = task.then(() => undefined, () => undefined);
    await task;
  }

  async function undo() {
    if (!selectedGame || !window.confirm(t("play.undoConfirm"))) return;
    const task = operationTail.current.then(async () => {
      const queued = await listQueuedOperations(owner, selectedGame.id);
      if (queued.some((operation) => operation.status !== "pending")) { setStatus(t("play.resolveConflictFirst")); return; }
      const { undoSeq } = nextOperationSequence(confirmedEventsRef.current, queued);
      if (undoSeq <= 1) return;
      const operation = await enqueueOperation({ owner, playedGameId: selectedGame.id, operationKind: "undo", expectedSeq: undoSeq });
      setOperations((current) => [...current, operation]);
      if (navigator.onLine) void serverSyncRef.current();
      else setStatus(t("play.offline"));
    });
    operationTail.current = task.then(() => undefined, () => undefined);
    await task;
  }

  async function start() {
    if (!navigator.onLine || starting || !opponentName.trim()) return;
    const chosenLists = lists.filter((list) => ownListIds.includes(list.id));
    const selectedOpponentUnits = opponents.filter((unit) => opponentUnitIds.includes(unit.id)).map((unit) => ({ id: unit.id, name: unit.name }));
    const customOpponentUnits: { id?: string; name: string }[] = manualOpponentUnits.split(",").map((name) => name.trim()).filter(Boolean).map((name, index) => ({ id: `manual-${index + 1}-${name}`, name }));
    const opponentUnits = unique([...selectedOpponentUnits, ...customOpponentUnits], (unit) => unit.id ?? unit.name);
    const snapshots = chosenLists.map((list) => ({
      id: list.id,
      name: list.name,
      selections: list.definition,
    }));
    const unitsById = chosenLists.flatMap((list) => unitsForList(list, packs.find((pack) => pack.id === list.packId) ?? currentPack));
    const ownerFaction = chosenLists.map((list) => {
      const selections = record(list.definition.selections);
      return typeof list.definition.factionId === "string" ? list.definition.factionId : typeof selections.factionId === "string" ? selections.factionId : undefined;
    }).find(Boolean);
    const snapshot: PlayStartSnapshot = {
      schemaVersion: 1,
      gameId: game.id,
      module: game,
      modeId: chosenLists[0] && (chosenLists[0].definition.modeId as string | undefined),
      sides: {
        owner: { factionId: ownerFaction, listIds: chosenLists.map((list) => list.id), lists: snapshots, units: unitsById },
        opponent: { name: opponentName.trim(), factionId: opponentFaction.trim() || undefined, listName: opponentListName.trim() || undefined, units: opponentUnits },
      },
    };
    const payload = { gameId: game.id, listIds: chosenLists.map((list) => list.id), opponentName: opponentName.trim(), opponentFaction: opponentFaction.trim() || undefined, opponentList: opponentListName.trim() || undefined, opponentUnits, snapshot };
    const operationId = crypto.randomUUID();
    const hash = await payloadHash(withoutUndefined(payload));
    setStarting(true);
    setStatus("");
    const result = await startGame({ ...payload, operationId, payloadHash: hash });
    if (!result.ok) {
      setStatus(t(`play.error.${result.error}`));
      setStarting(false);
      return;
    }
    router.push(`/play?id=${result.value.playedGameId}`);
    router.refresh();
  }

  async function resolveQueue(choice: "rebase" | "discard") {
    if (!selectedGame || !conflictOps.length) return;
    if (choice === "discard") {
      if (!window.confirm(t("play.discardConflict", { count: operations.length }))) return;
      for (const operation of operations) await markOperation(operation.id, "delete");
      await refreshFromServer(selectedGame.id);
      setOperations([]);
      setStatus(t("play.queueDiscarded"));
      return;
    }
    if (!window.confirm(t("play.rebaseConflict", { count: operations.length }))) return;
    const freshEvents = await refreshFromServer(selectedGame.id);
    if (!freshEvents) return;
    const oldQueue = await listQueuedOperations(owner, selectedGame.id);
    let highest = freshEvents.at(-1)?.seq ?? 0;
    for (const operation of oldQueue) await markOperation(operation.id, "delete");
    const rebuilt: OfflineOperation[] = [];
    for (const operation of oldQueue) {
      if (operation.operationKind === "undo") {
        if (highest <= 1) continue;
        rebuilt.push(await enqueueOperation({ owner, playedGameId: selectedGame.id, operationKind: "undo", expectedSeq: highest }));
        highest -= 1;
      } else if (operation.kind && operation.payload) {
        rebuilt.push(await enqueueOperation({ owner, playedGameId: selectedGame.id, operationKind: "append", expectedSeq: highest + 1, kind: operation.kind, payload: operation.payload }));
        highest += 1;
      }
    }
    setOperations(rebuilt);
    setStatus(t("play.rebaseStarted"));
    if (navigator.onLine) void serverSyncRef.current();
  }

  if (!selectedGame) return <>
    <div className="play-workspace setup">
      <section className="w-card card-pad play-start-form">
        <h1 className="w-display page-title">{t("play.title")}</h1>
        <p className="hint">{t(game.name ? "play.startDescription" : "play.title")}</p>
        <label className="field-label">{t("play.opponentName")} *<input value={opponentName} onChange={(event) => setOpponentName(event.target.value)} required /></label>
        <label className="field-label">{t("play.opponentFaction")}<input value={opponentFaction} onChange={(event) => setOpponentFaction(event.target.value)} /></label>
        <label className="field-label">{t("play.opponentList")}<input value={opponentListName} onChange={(event) => setOpponentListName(event.target.value)} /></label>
        <label className="field-label">{t("play.opponentUnits")}<select multiple size={Math.min(5, Math.max(2, opponents.length))} value={opponentUnitIds} onChange={(event) => setOpponentUnitIds(Array.from(event.target.selectedOptions, (option) => option.value))}>
          {opponents.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select><input value={manualOpponentUnits} onChange={(event) => setManualOpponentUnits(event.target.value)} placeholder={t("play.manualOpponentUnits")} /></label>
        <fieldset className="play-list-choice">
          <legend>{t("play.ownLists")}</legend>
          {lists.length ? lists.map((list) => (
            <label className="list-choice" key={list.id}>
              <input type="checkbox" checked={ownListIds.includes(list.id)} onChange={(event) => setOwnListIds((current) => event.target.checked ? [...current, list.id] : current.filter((id) => id !== list.id))} />
              <span>{list.name}</span>
              <small className={`validation-status ${list.validation.status}`}>{list.validation.status === "complete" ? t("play.completeValidation") : t("play.incompleteValidation")}</small>
            </label>
          )) : <p className="hint">{t("play.noListsForGame")} <Link href="/lists">{t("play.listBuilder")}</Link></p>}
        </fieldset>
        {!ownListIds.length && <p className="hint">{t("play.selectOwnList")}</p>}
        <p className="hint">{t("play.startValidationNote")}</p>
        {status && <p role="status">{status}</p>}
        <button type="button" className="btn" disabled={starting || !opponentName.trim() || !ownListIds.length || !online} onClick={() => void start()}>{t("play.start")}</button>
        {!online && <p className="hint">{t("play.startOnlineOnly")}</p>}
      </section>
      <section className="w-card card-pad play-history">
        <h2>{t("play.history")}</h2>
        {history.length ? history.map((row) => <HistoryButton key={row.id} row={row} current={false} game={game} locale={locale} />) : <p className="hint">{t("play.noGames")}</p>}
      </section>
    </div>
  </>;

  const sessionGame = state?.start.module ?? game;
  const currentPhase = phaseFor(sessionGame, state?.phaseIndex ?? 0);
  const currentSide = state?.activeSide ?? "owner";
  const roundUnitOptions = [...units.owner, ...units.opponent].map((unit) => ({ id: unit.id ?? unit.name, name: unit.name }));
  const elapsed = state?.timer.status === "running" && state.timer.startedAt ? state.timer.elapsedMs + Math.max(0, timerNow - state.timer.startedAt) : state?.timer.elapsedMs ?? 0;
  const latestNote = [...viewEvents].reverse().find((event) => event.kind === "game_note")?.payload?.text;

  function nextPhase() {
    if (!state || !currentPhase) return;
    const nextIndex = state.phaseIndex + 1;
    if (nextIndex < sessionGame.phases.length) void append("phase_advanced", { phaseIndex: nextIndex, activeSide: currentSide });
    else if (sessionGame.rounds === undefined || state.round < sessionGame.rounds) void append("round_advanced", { round: state.round + 1, activeSide: currentSide });
  }

  function setTracker(tracker: PlayModuleSnapshot["trackers"][number], scope: "game" | "side" | "unit" | "round", side?: PlaySide, unitId?: string, value?: number | boolean | string) {
    const next: TrackerValue = { trackerId: tracker.id, scope, side, unitId, round: scope === "round" ? state?.round : undefined, value: value ?? trackerInitialValue(tracker) };
    void append("tracker_set", { tracker: next });
  }

  function controlTracker(tracker: PlayModuleSnapshot["trackers"][number], scope: "game" | "side" | "unit" | "round", side?: PlaySide, unitId?: string) {
    if (!state) return null;
    const value = trackerValue(state, tracker.id, scope, side, unitId) ?? trackerInitialValue(tracker);
    if (tracker.kind === "counter" || tracker.kind === "resource") {
      const numeric = typeof value === "number" ? value : Number(value) || 0;
      return <div className="tracker-value-control" key={`${tracker.id}-${side ?? ""}-${unitId ?? ""}`}>
        <button type="button" className="tracker-step" aria-label={`${t(tracker.label)} ${t("play.decrease")}`} onClick={() => setTracker(tracker, scope, side, unitId, Math.max(tracker.min ?? Number.NEGATIVE_INFINITY, numeric - 1))}>−</button>
        <span className="num tracker-number">{numeric}</span>
        <button type="button" className="tracker-step" aria-label={`${t(tracker.label)} ${t("play.increase")}`} onClick={() => setTracker(tracker, scope, side, unitId, Math.min(tracker.max ?? Number.POSITIVE_INFINITY, numeric + 1))}>+</button>
      </div>;
    }
    if (tracker.kind === "toggle") return <button type="button" className="btn secondary" aria-pressed={value === true} onClick={() => setTracker(tracker, scope, side, unitId, value !== true)}>{value === true ? t("play.on") : t("play.off")}</button>;
    if (tracker.options?.length) return <select aria-label={t(tracker.label)} value={String(value)} onChange={(event) => setTracker(tracker, scope, side, unitId, event.target.value)}>{tracker.options.map((option) => <option key={option.id} value={option.id}>{t(option.label)}</option>)}</select>;
    return <input aria-label={t(tracker.label)} value={String(value)} onChange={(event) => setTracker(tracker, scope, side, unitId, event.target.value)} />;
  }

  function renderTracker(tracker: PlayModuleSnapshot["trackers"][number]) {
    if (tracker.scope === "side") return <section className="play-tracker" key={tracker.id}>
      <h3>{t(tracker.label)}</h3>
      <div className="tracker-sides">{(["owner", "opponent"] as const).map((side) => <div key={side}><span className="label">{t(`play.${side}Side`)}</span>{controlTracker(tracker, "side", side)}</div>)}</div>
    </section>;
    if (tracker.scope === "unit") return <section className="play-tracker" key={tracker.id}>
      <h3>{t(tracker.label)}</h3>
      <label className="field-label">{t("play.selectUnit")}<select value={selectedUnit} onChange={(event) => setSelectedUnit(event.target.value)}><option value="">{t("play.chooseUnit")}</option>{(["owner", "opponent"] as const).flatMap((side) => roundUnitOptions.map((unit) => unit.id && (units[side] ?? []).some((item) => (item.id ?? item.name) === unit.id) ? <option key={`${side}-${unit.id}`} value={`${side}:${unit.id}`}>{t(`play.${side}Side`)} · {unit.name}</option> : []))}</select></label>
      {selectedUnit.split(":").length > 1 && (() => { const [side, ...rest] = selectedUnit.split(":"); return controlTracker(tracker, "unit", side as PlaySide, rest.join(":")); })()}
    </section>;
    if (tracker.scope === "round") return <section className="play-tracker" key={tracker.id}><h3>{t(tracker.label)} · {t("play.round", { round: state?.round ?? 1 })}</h3>{controlTracker(tracker, "round")}</section>;
    return <section className="play-tracker" key={tracker.id}><h3>{t(tracker.label)}</h3>{controlTracker(tracker, "game")}</section>;
  }

  function setSide(side: PlaySide) { void append("side_changed", { activeSide: side }); }
  function timerStart(event: MouseEvent<HTMLButtonElement>) { void append("timer_started", { startedAt: performance.timeOrigin + event.timeStamp, elapsedMs: state?.timer.elapsedMs ?? 0 }); }
  function timerStop() { void append("timer_stopped", { elapsedMs: elapsed }); }
  function timerReset() { void append("timer_reset", {}); }
  function rollDice() {
    const values = Array.from({ length: Math.max(1, Math.min(100, diceCount)) }, () => {
      const bytes = new Uint32Array(1); crypto.getRandomValues(bytes); return (bytes[0]! % 6) + 1;
    });
    void append("game_note", { kind: "dice", text: `${t("play.dice")}: ${values.join(", ")}` });
  }
  function saveNote() {
    if (!note.trim()) return;
    void append("game_note", { kind: "quick-reference", text: note.trim() });
    setNote("");
  }
  function updateOrder() {
    const selectedOrder = sessionGame.orderOptions.length ? orderId : manualOrderId.trim();
    if (!selectedOrder || !state) return;
    void append("order_deck_set", { orderIds: [...state.orders, selectedOrder] });
    setOrderId("");
    setManualOrderId("");
  }
  function removeOrder(id: string) {
    if (!state) return;
    const index = state.orders.indexOf(id);
    if (index < 0) return;
    void append("order_deck_set", { orderIds: state.orders.filter((_, i) => i !== index) });
  }
  function setStruggle() {
    if (!struggleKey.trim() || !struggleValue) return;
    void append("struggle_set", { key: struggleKey.trim(), value: struggleValue });
    setStruggleKey("");
    setStruggleValue("");
  }
  function recordResult(result: "win" | "loss" | "draw") { void append("game_completed", { result, winner: result === "draw" ? "draw" : result === "win" ? "owner" : "opponent" }); }

  const currentRoundDone = sessionGame.rounds !== undefined && (state?.round ?? 1) >= sessionGame.rounds && (state?.phaseIndex ?? 0) >= sessionGame.phases.length - 1;
  const phaseRail = <nav className="play-phase-rail" aria-label={t("play.phase")}>
    <div className="play-round-label">{t("play.round", { round: state?.round ?? 1 })}{sessionGame.rounds ? ` / ${sessionGame.rounds}` : ""}</div>
    <div className="play-active-chip">{t(`play.${currentSide}Side`)}</div>
    {sessionGame.phases.map((phase, index) => <div key={phase.id} className="play-phase" aria-current={index === state?.phaseIndex ? "step" : undefined}>{phase.label}</div>)}
    <div className="play-rail-actions">
      <button type="button" className="btn secondary play-touch" onClick={nextPhase} disabled={currentRoundDone}>{(state?.phaseIndex ?? 0) + 1 >= sessionGame.phases.length ? t("play.nextRound") : t("play.nextPhase")}</button>
      <button type="button" className="btn ghost play-touch" onClick={() => void undo()} disabled={viewEvents.length < 2 || !!conflictOps.length}>{t("play.undo")}</button>
    </div>
  </nav>;

  return <div className="play-workspace table-play">
    <header className="table-play-header">
      <div><div className="label">{sessionGame.name} · {t("play.round", { round: state?.round ?? 1 })}{sessionGame.rounds ? ` / ${sessionGame.rounds}` : ""}</div><h1 className="w-display page-title">{String(record(startSnapshotFromEvent(confirmedEvents)?.sides.owner.lists[0]).name ?? t("play.title"))}</h1><div className="hint">{t("play.vs")} {startSnapshotFromEvent(confirmedEvents)?.sides.opponent.name ?? selectedGame.opponent}</div></div>
      <div className="play-side-switch" role="group" aria-label={t("play.activeSide")}>
        <button type="button" aria-pressed={currentSide === "owner"} className="btn secondary" onClick={() => setSide("owner")}>{t("play.ownerSide")}</button>
        <button type="button" aria-pressed={currentSide === "opponent"} className="btn secondary" onClick={() => setSide("opponent")}>{t("play.opponentSide")}</button>
      </div>
    </header>
    <div className="table-play-body">
      {phaseRail}
      <main className="play-unit-column">
        <div className="play-column-head"><h2>{t("play.units")}</h2><span className="label">{units.owner.length + units.opponent.length}</span></div>
        <section className="play-units-grid" aria-label={t("play.units")}>
          {(["owner", "opponent"] as const).flatMap((side) => units[side].map((unit) => <article className={`w-card play-unit-card ${side}`} key={`${side}:${unit.id ?? unit.name}`}>
            <div className="play-unit-accent" aria-hidden="true" />
            <div className="play-unit-heading"><div><h3>{unit.name}</h3><div className="label">{t(`play.${side}Side`)}</div></div><span className="label">{(sessionGame.trackers ?? []).filter((tracker) => tracker.scope === "unit").map((tracker) => String(state ? trackerValue(state, tracker.id, "unit", side, unit.id ?? unit.name) ?? trackerInitialValue(tracker) : trackerInitialValue(tracker))).join(" · ")}</span></div>
            <div className="play-unit-controls">{(sessionGame.trackers ?? []).filter((tracker) => tracker.scope === "unit").map((tracker) => <div key={tracker.id}><span className="label">{t(tracker.label)}</span>{controlTracker(tracker, "unit", side, unit.id ?? unit.name)}</div>)}</div>
          </article>))}
          {!units.owner.length && !units.opponent.length && <p className="hint">{t("play.noUnitsSnapshot")}</p>}
        </section>
      </main>
      <aside className="play-score-column" aria-label={t("play.trackers")}>
        <div className="play-scores">
          {(["owner", "opponent"] as const).map((side) => <section className={`play-score ${side}`} key={side}><span className="label">{t(`play.${side}Side`)}</span><strong>{String(state?.trackers[`side:${side}:::victory-points`] ?? 0)}</strong><small>{t("play.victoryPoints")}</small></section>)}
        </div>
        <h2>{t("play.trackers")}</h2>
        {(sessionGame.trackers ?? []).filter((tracker) => tracker.scope !== "unit").map(renderTracker)}
        {sessionGame.tools.orderDeck && <section className="play-tool">
          <h2>{t("play.orderDeck")}</h2>
          <div className="play-order-pool">{(state?.orders ?? []).map((id, index) => <button type="button" className="play-order" key={`${id}-${index}`} onClick={() => removeOrder(id)}>{sessionGame.orderOptions.find((order) => order.id === id)?.label ?? id} · {t("play.remove")}</button>)}</div>
          {sessionGame.orderOptions.length ? <label className="field-label">{t("play.addOrder")}<select value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">{t("play.chooseOrder")}</option>{sessionGame.orderOptions.map((order) => <option key={order.id} value={order.id}>{order.label}</option>)}</select></label> : <label className="field-label">{t("play.addOrder")}<input value={manualOrderId} onChange={(event) => setManualOrderId(event.target.value)} placeholder={t("play.manualOrderId")} /></label>}
          <button type="button" className="btn secondary" onClick={updateOrder} disabled={sessionGame.orderOptions.length ? !orderId : !manualOrderId.trim()}>{t("play.addOrder")}</button>
        </section>}
        {sessionGame.tools.struggleTrack && <section className="play-tool">
          <h2>{t("play.struggle")}</h2>
          <label className="field-label">{t("play.struggleMarker")}<input value={struggleKey} onChange={(event) => setStruggleKey(event.target.value)} /></label>
          <label className="field-label">{t("play.value")}<select value={struggleValue} onChange={(event) => setStruggleValue(event.target.value)}><option value="">{t("play.chooseSide")}</option><option value="owner">{t("play.ownerSide")}</option><option value="opponent">{t("play.opponentSide")}</option><option value="contested">{t("play.contested")}</option></select></label>
          <button type="button" className="btn secondary" onClick={setStruggle}>{t("play.record")}</button>
          <ul>{Object.entries(state?.struggle ?? {}).map(([key, value]) => <li key={key}>{key}: {String(value)}</li>)}</ul>
        </section>}
        <section className="play-tool">
          <h2>{t("play.timer")}</h2><output className="num timer-output">{formatElapsed(elapsed)}</output>
          <div className="row-gap"><button type="button" className="btn secondary" onClick={state?.timer.status === "running" ? timerStop : timerStart}>{state?.timer.status === "running" ? t("play.timerStop") : t("play.timerStart")}</button><button type="button" className="btn secondary" onClick={timerReset}>{t("play.timerReset")}</button></div>
        </section>
        <section className="play-tool">
          <h2>{t("play.dice")}</h2><label className="field-label">{t("play.diceCount")}<input type="number" min="1" max="100" value={diceCount} onChange={(event) => setDiceCount(Number(event.target.value))} /></label><button type="button" className="btn secondary" onClick={rollDice}>{t("play.roll")}</button>
        </section>
        <section className="play-tool">
          <h2>{t("play.damageCalculator")}</h2>
          <div className="damage-grid">{([["attacks", "play.attacks"], ["dice", "play.dicePerAttack"], ["successes", "play.successesPerAttack"], ["damage", "play.damagePerSuccess"]] as const).map(([key, label]) => <label className="field-label" key={key}>{t(label)}<input type="number" min="0" value={damageInput[key]} onChange={(event) => setDamageInput((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div>
          <output className="num">{t("play.totalDamage")}: {damageInput.attacks * damageInput.dice * damageInput.successes * damageInput.damage}</output>
        </section>
        <section className="play-tool">
          <h2>{t("play.quickReference")}</h2><p className="hint">{t("play.quickReferenceBody")}</p><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} aria-label={t("play.note")} /><button type="button" className="btn secondary" onClick={saveNote} disabled={!note.trim()}>{t("play.saveNote")}</button>
          {typeof latestNote === "string" && <p className="quick-note">{latestNote}</p>}
        </section>
        <section className="play-tool play-result">
          <h2>{state?.completed ? t("play.done") : t("play.result")}</h2>
          {(["win", "loss", "draw"] as const).map((result) => <button type="button" key={result} className="btn secondary" aria-pressed={state?.completed === result} onClick={() => recordResult(result)}>{t(`play.${result}`)}</button>)}
        </section>
      </aside>
    </div>
    {conflictOps.length > 0 && <section className="play-conflict w-card card-pad" role="alert">
      <h2>{t("play.syncConflict")}</h2><p>{t("play.syncQueueNeedsResolution", { count: operations.length })}</p>
      <div className="row-gap"><button type="button" className="btn secondary" onClick={() => void resolveQueue("rebase")}>{t("play.rebaseConflictAction")}</button><button type="button" className="btn danger" onClick={() => void resolveQueue("discard")}>{t("play.discardConflictAction")}</button></div>
    </section>}
    <footer className="play-sync-bar" aria-live="polite">
      <span>{online ? t("play.online") : t("play.offline")}</span>
      {pendingOps.length > 0 && <span>{t("play.syncPending", { count: pendingOps.length })}</span>}
      {status && <span>{status}</span>}
      {pendingOps.length > 0 && !conflictOps.length && <button type="button" className="btn secondary" disabled={!online || syncing} onClick={() => void syncQueue()}>{syncing ? t("play.syncing") : t("play.syncNow")}</button>}
    </footer>
    <section className="play-history-inline"><h2>{t("play.history")}</h2>{history.map((row) => <HistoryButton key={row.id} row={row} current={row.id === selectedGame.id} game={game} locale={locale} />)}</section>
  </div>;
}

function startSnapshotFromEvent(events: PlayEvent[]): PlayStartSnapshot | undefined {
  const first = events[0];
  const snapshot = first?.kind === "game_started" ? first.payload.snapshot : undefined;
  if (!snapshot || typeof snapshot !== "object") return undefined;
  return snapshot as PlayStartSnapshot;
}

function formatElapsed(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function HistoryButton({ row, current, game, locale }: { row: HistoryRow; current: boolean; game: PlayModuleSnapshot; locale: Locale }) {
  const t = featureTranslator(locale);
  return <Link className="play-history-row" href={`/play?id=${row.id}`} aria-current={current ? "page" : undefined}>
    <span className="strong">{row.opponent || t("play.opponentSide")}</span>
    <span className="label">{row.playedOn} · {row.result ? t(`play.${row.result}`) : t("play.inProgress")}</span>
    <span className="label">{game.name}</span>
  </Link>;
}
