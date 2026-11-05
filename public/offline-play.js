(() => {
  const de = /^de(?:-|$)/i.test(navigator.language || "");
  const text = de ? {
    title: "Offline-Tisch", intro: "Diese private Offline-Ansicht nutzt nur den lokal gespeicherten Spielstand des zuletzt auf diesem Gerät angemeldeten Kontos.", load: "Gespeicherte Spiele laden", game: "Gespeichertes Spiel", controls: "Tischsteuerung", phase: "Nächste Phase", round: "Nächste Runde", side: "Seite wechseln", order: "Befehlsdeck", addOrder: "Befehl hinzufügen", manualOrder: "Befehlsname oder Kennung eingeben", struggle: "Konflikt", marker: "Marker", value: "Wert", recordMarker: "Marker speichern", timer: "Rundenuhr", startPause: "Starten / pausieren", reset: "Zurücksetzen", note: "Tischnotiz", saveNote: "Notiz speichern", actions: "Gespeicherte Aktionen", reconnect: "Mit Tabletop Armies verbinden", undo: "Letzte Aktion zurücknehmen", current: "aktuell", minus: "eins verringern", plus: "eins erhöhen", on: "An", off: "Aus", record: "Wert speichern", queued: "Aktion(en) warten auf diesem Gerät. Zum Synchronisieren online anmelden.", review: "Aktion(en) müssen nach dem erneuten Verbinden geprüft werden.", loaded: "Gespeicherter Tisch geladen.", noAccount: "Auf diesem Gerät wurde kein angemeldetes Konto gefunden. Bitte zuerst online verbinden.", noSnapshot: "Für dieses Konto ist noch kein Spiel lokal gespeichert.", storage: "Lokaler Speicher ist in diesem Browser nicht verfügbar.", dice: "Würfelhilfe", diceCount: "Anzahl der Würfel", damage: "Schadensrechner", attacks: "Angriffe", diceAttack: "Würfel je Angriff", successes: "Erfolge je Angriff", damageValue: "Schaden je Erfolg", totalDamage: "Gesamtschaden", result: "Spielergebnis", win: "Sieg", loss: "Niederlage", draw: "Unentschieden", drew: "Wurf", total: "Gesamtschaden"
  } : {
    title: "Offline table", intro: "This private offline view uses only the game state saved for the account last authenticated on this device.", load: "Load saved games", game: "Saved game", controls: "Table controls", phase: "Next phase", round: "Next round", side: "Change side", order: "Order deck", addOrder: "Add order", manualOrder: "Enter an order name or id", struggle: "Struggle", marker: "Marker", value: "Value", recordMarker: "Record marker", timer: "Turn timer", startPause: "Start or pause", reset: "Reset", note: "Table note", saveNote: "Record note", actions: "Saved actions", reconnect: "Reconnect to Tabletop Armies", undo: "Undo last action", current: "current", minus: "minus one", plus: "plus one", on: "On", off: "Off", record: "Record value", queued: "action(s) queued on this device. Reconnect while signed in to sync.", review: "action(s) need review after reconnecting.", loaded: "Saved table state loaded.", noAccount: "No authenticated account is available on this device. Reconnect while online first.", noSnapshot: "No game snapshot for this account is saved on this device yet.", storage: "Local storage is unavailable in this browser.", dice: "Dice helper", diceCount: "Dice count", damage: "Damage calculator", attacks: "Attacks", diceAttack: "Dice per attack", successes: "Successes per attack", damageValue: "Damage per success", totalDamage: "Total damage", result: "Game result", win: "Win", loss: "Loss", draw: "Draw", drew: "Dice", total: "Total damage"
  };
  const localizeShell = () => {
    document.documentElement.lang = de ? "de" : "en";
    document.title = `Tabletop Armies · ${text.title}`;
    document.querySelector("main > h1").textContent = text.title;
    document.querySelector("main > p").textContent = text.intro;
    byId("load-games").textContent = text.load;
    document.querySelector('label[for="game"]').textContent = text.game;
    document.querySelector("#saved-games > h2").textContent = text.controls;
    document.querySelector('[data-action="phase"]').textContent = text.phase;
    document.querySelector('[data-action="round"]').textContent = text.round;
    document.querySelector('[data-action="side"]').textContent = text.side;
    document.querySelector("#orders-panel h2").textContent = text.order;
    document.querySelector('label[for="order-id"]').textContent = text.addOrder;
    document.querySelector('#order-form button').textContent = text.addOrder;
    byId("manual-order-id").placeholder = text.manualOrder;
    document.querySelector("#struggle-panel h2").textContent = text.struggle;
    document.querySelector('label[for="struggle-key"]').textContent = text.marker;
    document.querySelector('label[for="struggle-value"]').textContent = text.value;
    document.querySelector("#struggle-form button").textContent = text.recordMarker;
    document.querySelector("#timer-panel h2").textContent = text.timer;
    document.querySelector('[data-action="timer"]').textContent = text.startPause;
    document.querySelector('[data-action="timer-reset"]').textContent = text.reset;
    document.querySelector('label[for="note"]').textContent = text.note;
    document.querySelector("#note-form button").textContent = text.saveNote;
    document.querySelector("#saved-games > h2:last-of-type").textContent = text.actions;
    document.querySelector("main > p:last-child a").textContent = text.reconnect;
    byId("dice-title").textContent = text.dice; byId("dice-count").previousElementSibling.textContent = text.diceCount;
    byId("roll-dice").textContent = de ? "Würfeln" : "Roll";
    byId("damage-title").textContent = text.damage; byId("damage-attacks").parentElement.firstChild.textContent = text.attacks;
    byId("damage-dice").parentElement.firstChild.textContent = text.diceAttack; byId("damage-successes").parentElement.firstChild.textContent = text.successes; byId("damage-value").parentElement.firstChild.textContent = text.damageValue;
    byId("damage-total").textContent = `${text.totalDamage}: 1`;
    byId("result-title").textContent = text.result;
    for (const result of ["win", "loss", "draw"]) document.querySelector(`[data-result="${result}"]`).textContent = text[result];
  };
  const dbName = "tabletop-armies-play";
  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const requestValue = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const txDone = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  const canonical = (value) => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  };
  const hash = async (value) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value))))].map((v) => v.toString(16).padStart(2, "0")).join("");
  const state = { owner: "", snapshot: null, events: [], pending: [] };
  const byId = (id) => document.getElementById(id);
  let operationWriteQueue = Promise.resolve();
  let lastOperationTime = 0;
  localizeShell();

  async function loadSnapshots() {
    const db = await openDb();
    const tx = db.transaction(["snapshots", "operations", "metadata"], "readonly");
    const snapshots = await requestValue(tx.objectStore("snapshots").getAll());
    const operations = await requestValue(tx.objectStore("operations").getAll());
    const identity = await requestValue(tx.objectStore("metadata").get("active-owner"));
    await txDone(tx);
    db.close();
    return { owner: identity?.owner, snapshots: snapshots.filter((row) => row.owner === identity?.owner), operations: operations.filter((row) => row.owner === identity?.owner) };
  }

  function addOperation(kind, payload) {
    const task = operationWriteQueue.then(async () => {
      if (state.pending.some((operation) => operation.status !== "pending")) {
        byId("sync-status").textContent = text.review;
        return;
      }
      const operationKind = "append";
      const expectedSeq = (state.events.at(-1)?.seq ?? 0) + 1;
      lastOperationTime = Math.max(Date.now(), lastOperationTime + 1);
      const op = {
        id: crypto.randomUUID(), owner: state.owner, playedGameId: state.snapshot.playedGameId,
        operationKind, expectedSeq, kind, payload, status: "pending", createdAt: lastOperationTime,
      };
      op.payloadHash = await hash({ playedGameId: op.playedGameId, operationKind, expectedSeq, kind, payload });
      const db = await openDb();
      const tx = db.transaction("operations", "readwrite");
      tx.objectStore("operations").add(op);
      await txDone(tx);
      db.close();
      state.pending.push(op);
      state.events.push({ seq: expectedSeq, kind, payload });
      render();
    });
    operationWriteQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  function getFrozenSnapshot() {
    const startEvent = state.snapshot?.events?.find((event) => event.seq === 1 && event.kind === "game_started");
    const snapshot = startEvent?.payload?.snapshot;
    return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : null;
  }

  function undoLast() {
    const task = operationWriteQueue.then(async () => {
      const expectedSeq = state.events.at(-1)?.seq ?? 0;
      if (expectedSeq <= 1 || state.pending.some((operation) => operation.status !== "pending")) return;
      lastOperationTime = Math.max(Date.now(), lastOperationTime + 1);
      const op = {
        id: crypto.randomUUID(), owner: state.owner, playedGameId: state.snapshot.playedGameId,
        operationKind: "undo", expectedSeq, status: "pending", createdAt: lastOperationTime,
      };
      op.payloadHash = await hash({ playedGameId: op.playedGameId, operationKind: op.operationKind, expectedSeq, kind: undefined, payload: undefined });
      const db = await openDb();
      const tx = db.transaction("operations", "readwrite");
      tx.objectStore("operations").add(op);
      await txDone(tx);
      db.close();
      state.pending.push(op);
      state.events.pop();
      render();
    });
    operationWriteQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  };
  const getState = () => {
    const value = { round: 1, phaseIndex: 0, side: "owner", trackers: {}, orders: [], struggle: {}, timer: { status: "idle", startedAt: 0, elapsedMs: 0 }, notes: [], completed: null };
    state.events.slice(1).forEach((event) => {
      const payload = event.payload || {};
      if (event.kind === "phase_advanced") { value.phaseIndex = payload.phaseIndex; value.side = payload.activeSide || value.side; }
      if (event.kind === "round_advanced") { value.round = payload.round; value.phaseIndex = 0; value.side = payload.activeSide || value.side; }
      if (event.kind === "side_changed") value.side = payload.activeSide;
      if (event.kind === "tracker_set" && payload.tracker) {
        const tracker = payload.tracker;
        value.trackers[[tracker.scope, tracker.side || "", tracker.unitId || "", tracker.round || "", tracker.trackerId].join(":")] = tracker.value;
      }
      if (event.kind === "order_deck_set") value.orders = [...(payload.orderIds || [])];
      if (event.kind === "struggle_set") value.struggle[payload.key] = payload.value;
      if (event.kind === "timer_started") value.timer = { status: "running", startedAt: payload.startedAt, elapsedMs: payload.elapsedMs };
      if (event.kind === "timer_stopped") value.timer = { status: "paused", startedAt: 0, elapsedMs: payload.elapsedMs };
      if (event.kind === "timer_reset") value.timer = { status: "idle", startedAt: 0, elapsedMs: 0 };
      if (event.kind === "game_note" && payload.text) value.notes.push(payload.text);
      if (event.kind === "game_completed") value.completed = payload.result;
    });
    return value;
  };
  const trackerKey = (scope, side, unitId, round, trackerId) => [scope, side || "", unitId || "", round || "", trackerId].join(":");
  const addTrackerEvent = (tracker, scope, side, unitId, value) => addOperation("tracker_set", { tracker: { trackerId: tracker.id, scope, side, unitId, round: scope === "round" ? getState().round : undefined, value } });
  const drawTracker = (container, tracker, scope, side, unit) => {
    const current = getState().trackers[trackerKey(scope, side, unit?.id, scope === "round" ? getState().round : undefined, tracker.id)] ?? (tracker.kind === "toggle" ? false : tracker.kind === "track" ? tracker.options?.[0]?.id || "" : 0);
    const row = make("div", undefined, "offline-tracker-row");
    row.append(make("span", tracker.label, "offline-label"));
    if (tracker.kind === "counter" || tracker.kind === "resource") {
      const step = (delta) => addTrackerEvent(tracker, scope, side, unit?.id, Math.min(tracker.max ?? Number.MAX_SAFE_INTEGER, Math.max(tracker.min ?? Number.MIN_SAFE_INTEGER, Number(current) + delta)));
      const minus = make("button", "−"); minus.type = "button"; minus.setAttribute("aria-label", `${tracker.label} ${text.minus}`); minus.addEventListener("click", () => step(-1));
      const number = make("span", current, "offline-number");
      const plus = make("button", "+"); plus.type = "button"; plus.setAttribute("aria-label", `${tracker.label} ${text.plus}`); plus.addEventListener("click", () => step(1));
      row.append(minus, number, plus);
    } else if (tracker.kind === "toggle") {
      const button = make("button", current ? text.on : text.off); button.type = "button"; button.setAttribute("aria-pressed", String(current)); button.addEventListener("click", () => addTrackerEvent(tracker, scope, side, unit?.id, !current)); row.append(button);
    } else if (tracker.options?.length) {
      const select = document.createElement("select"); select.setAttribute("aria-label", tracker.label);
      tracker.options.forEach((option) => { const item = make("option", option.label); item.value = option.id; select.append(item); });
      select.value = String(current); select.addEventListener("change", () => addTrackerEvent(tracker, scope, side, unit?.id, select.value)); row.append(select);
    } else {
      const input = document.createElement("input"); input.value = String(current); input.setAttribute("aria-label", tracker.label);
      const button = make("button", text.record); button.type = "button"; button.addEventListener("click", () => addTrackerEvent(tracker, scope, side, unit?.id, tracker.kind === "track" ? input.value : Number(input.value))); row.append(input, button);
    }
    container.append(row);
  };
  function render() {
    const snapshot = getFrozenSnapshot();
    const frozenGame = snapshot?.module && typeof snapshot.module === "object" && !Array.isArray(snapshot.module) ? snapshot.module : null;
    const current = getState();
    const phases = Array.isArray(frozenGame?.phases) ? frozenGame.phases : [];
    const phaseState = byId("phase-state");
    phaseState.replaceChildren();
    phaseState.append(make("p", `${frozenGame?.labels?.round || (de ? "Runde" : "Round")} ${current.round}${frozenGame?.rounds ? ` / ${frozenGame.rounds}` : ""} · ${phases[current.phaseIndex]?.label || frozenGame?.labels?.phase || "Phase"} · ${frozenGame?.labels?.[current.side] || current.side}`));
    phases.forEach((phase, index) => phaseState.append(make("div", `${index + 1}. ${phase.label}${index === current.phaseIndex ? ` · ${text.current}` : ""}`, "offline-phase")));
    byId("controls").querySelector('[data-action="phase"]').disabled = current.phaseIndex + 1 >= phases.length && frozenGame?.rounds !== undefined && current.round >= frozenGame.rounds;
    byId("controls").querySelector('[data-action="round"]').disabled = current.phaseIndex !== phases.length - 1 || (frozenGame?.rounds !== undefined && current.round >= frozenGame.rounds);
    const trackerPanel = byId("tracker-panels");
    trackerPanel.replaceChildren();
    const trackers = Array.isArray(frozenGame?.trackers) ? frozenGame.trackers : [];
    const sideTracks = trackers.filter((tracker) => tracker.scope === "side");
    const scoreboard = make("section"); scoreboard.append(make("h2", frozenGame?.labels?.trackers || "Trackers"));
    ["owner", "opponent"].forEach((side) => {
      const panel = make("section", frozenGame?.labels?.[side] || side, "offline-side-panel");
      sideTracks.forEach((tracker) => drawTracker(panel, tracker, "side", side));
      scoreboard.append(panel);
    });
    trackers.filter((tracker) => tracker.scope === "game" || tracker.scope === "round").forEach((tracker) => {
      const panel = make("section", undefined, "offline-side-panel"); drawTracker(panel, tracker, tracker.scope); scoreboard.append(panel);
    });
    trackers.filter((tracker) => tracker.scope === "unit").forEach((tracker) => {
      ["owner", "opponent"].forEach((side) => {
        const units = Array.isArray(snapshot?.sides?.[side]?.units) ? snapshot.sides[side].units : [];
        units.forEach((unit) => {
        const panel = make("section", `${frozenGame?.labels?.[side] || side} · ${unit.name}`, "offline-side-panel");
        drawTracker(panel, tracker, "unit", side, unit); scoreboard.append(panel);
        });
      });
    });
    trackerPanel.append(scoreboard);
    byId("orders-panel").hidden = !frozenGame?.tools?.orderDeck;
    byId("orders-list").replaceChildren();
    current.orders.forEach((id, index) => {
      const row = make("button", frozenGame?.orderOptions?.find((option) => option.id === id)?.label || id); row.type = "button";
      row.addEventListener("click", () => addOperation("order_deck_set", { orderIds: current.orders.filter((_, orderIndex) => orderIndex !== index) }));
      byId("orders-list").append(row);
    });
    const orderSelect = byId("order-id"); orderSelect.replaceChildren();
    const chooseOrder = make("option", de ? "Befehl auswählen" : "Choose an order"); chooseOrder.value = ""; orderSelect.append(chooseOrder);
    (frozenGame?.orderOptions || []).forEach((order) => { const option = make("option", order.label); option.value = order.id; orderSelect.append(option); });
    orderSelect.hidden = (frozenGame?.orderOptions || []).length === 0;
    byId("manual-order-id").hidden = (frozenGame?.orderOptions || []).length > 0;
    byId("order-label").htmlFor = orderSelect.hidden ? "manual-order-id" : "order-id";
    byId("struggle-panel").hidden = !frozenGame?.tools?.struggleTrack;
    byId("struggle-list").replaceChildren();
    Object.entries(current.struggle).forEach(([key, value]) => byId("struggle-list").append(make("p", `${key}: ${String(value)}`)));
    const elapsed = current.timer.status === "running" ? current.timer.elapsedMs + Date.now() - current.timer.startedAt : current.timer.elapsedMs;
    byId("timer-value").textContent = `${String(Math.floor(elapsed / 60000)).padStart(2, "0")}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")}`;
    const notes = byId("event-list"); notes.replaceChildren();
    current.notes.slice(-8).forEach((note) => notes.append(make("li", note)));
    const unresolved = state.pending.filter((op) => op.status !== "pending").length;
    byId("sync-status").textContent = unresolved ? `${unresolved} ${text.review}` : state.pending.length ? `${state.pending.length} ${text.queued}` : text.loaded;
    byId("result-panel").querySelectorAll("[data-result]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.result === current.completed)));
    byId("controls").querySelector('[data-action="undo"]').disabled = (state.events.at(-1)?.seq ?? 0) <= 1 || state.pending.some((op) => op.status !== "pending");
    byId("saved-games").hidden = false;
    const world = ["sigmar", "crisis", "legion", "saga", "gotham"].includes(frozenGame?.world) ? frozenGame.world : "sigmar";
    document.body.style.setProperty("--table-background", `url('/theme/backgrounds/${world}/field-1200.webp')`);
  }

  byId("load-games").addEventListener("click", async () => {
    try {
      const data = await loadSnapshots();
      if (!data.owner) {
        byId("sync-status").textContent = text.noAccount;
        byId("saved-games").hidden = false;
        return;
      }
      state.owner = data.owner;
      const select = byId("game");
      select.replaceChildren();
      data.snapshots.forEach((snapshot) => {
        const option = document.createElement("option");
        option.value = String(snapshot.playedGameId);
        option.textContent = `${snapshot.gameId} · #${snapshot.playedGameId}`;
        select.append(option);
      });
      if (data.snapshots.length) selectGame(data);
      else byId("sync-status").textContent = text.noSnapshot;
    } catch {
      byId("sync-status").textContent = text.storage;
      byId("saved-games").hidden = false;
    }
  });

  function selectGame(data) {
    const id = Number(byId("game").value);
    state.snapshot = data.snapshots.find((snapshot) => snapshot.playedGameId === id);
    state.events = [...state.snapshot.events];
    state.pending = data.operations.filter((op) => op.playedGameId === id).sort((a, b) => a.createdAt - b.createdAt);
    lastOperationTime = Math.max(lastOperationTime, ...state.pending.map((op) => op.createdAt), 0);
    state.pending.filter((op) => op.status === "pending").forEach((op) => {
      if (op.operationKind === "append" && op.kind && op.payload) state.events.push({ seq: op.expectedSeq, kind: op.kind, payload: op.payload });
      else if (op.operationKind === "undo" && state.events.at(-1)?.seq === op.expectedSeq) state.events.pop();
    });
    render();
  }

  byId("game").addEventListener("change", async () => {
    const data = await loadSnapshots();
    selectGame(data);
  });
  byId("controls").addEventListener("click", async (event) => {
    const action = event.target?.dataset?.action;
    if (!action || !state.snapshot) return;
    const current = getState();
    const frozenGame = getFrozenSnapshot()?.module;
    const phases = Array.isArray(frozenGame?.phases) ? frozenGame.phases : [];
    if (action === "phase" && current.phaseIndex + 1 < phases.length) await addOperation("phase_advanced", { phaseIndex: current.phaseIndex + 1, activeSide: current.side });
    if (action === "phase" && current.phaseIndex + 1 >= phases.length && (frozenGame?.rounds === undefined || current.round < frozenGame.rounds)) await addOperation("round_advanced", { round: current.round + 1, activeSide: current.side });
    if (action === "round" && (frozenGame?.rounds === undefined || current.round < frozenGame.rounds)) await addOperation("round_advanced", { round: current.round + 1, activeSide: current.side });
    if (action === "side") await addOperation("side_changed", { activeSide: current.side === "opponent" ? "owner" : "opponent" });
    if (action === "undo") await undoLast();
  });
  const undoButton = make("button", text.undo); undoButton.type = "button"; undoButton.dataset.action = "undo"; byId("controls").append(undoButton);
  byId("order-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const orderId = byId("order-id").hidden ? byId("manual-order-id").value.trim() : byId("order-id").value;
    if (orderId) await addOperation("order_deck_set", { orderIds: [...getState().orders, orderId] });
    byId("manual-order-id").value = "";
  });
  byId("struggle-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = byId("struggle-key").value.trim();
    const value = byId("struggle-value").value.trim();
    if (key && value) await addOperation("struggle_set", { key, value });
    event.target.reset();
  });
  byId("timer-panel").addEventListener("click", async (event) => {
    const action = event.target?.dataset?.action;
    if (action === "timer") {
      const timer = getState().timer;
      if (timer.status === "running") await addOperation("timer_stopped", { elapsedMs: timer.elapsedMs + Date.now() - timer.startedAt });
      else await addOperation("timer_started", { startedAt: Date.now(), elapsedMs: timer.elapsedMs });
    }
    if (action === "timer-reset") await addOperation("timer_reset", {});
  });
  byId("note-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await addOperation("game_note", { text: byId("note").value });
    event.target.reset();
  });
  byId("result-panel").addEventListener("click", async (event) => {
    const result = event.target?.dataset?.result;
    if (result === "win" || result === "loss" || result === "draw") await addOperation("game_completed", { result, winner: result === "draw" ? "draw" : result === "win" ? "owner" : "opponent" });
  });
  byId("roll-dice").addEventListener("click", async () => {
    const count = Math.max(1, Math.min(100, Number(byId("dice-count").value) || 1));
    const values = Array.from({ length: count }, () => { const bytes = new Uint32Array(1); crypto.getRandomValues(bytes); return bytes[0] % 6 + 1; });
    const result = `${text.drew}: ${values.join(", ")}`;
    byId("dice-result").textContent = result;
    await addOperation("game_note", { kind: "dice", text: result });
  });
  const updateDamage = () => {
    const total = ["damage-attacks", "damage-dice", "damage-successes", "damage-value"].map((id) => Math.max(0, Number(byId(id).value) || 0)).reduce((product, item) => product * item, 1);
    byId("damage-total").textContent = `${text.total}: ${total}`;
  };
  ["damage-attacks", "damage-dice", "damage-successes", "damage-value"].forEach((id) => byId(id).addEventListener("input", updateDamage));
  window.setInterval(() => { if (state.snapshot && getState().timer.status === "running") render(); }, 1000);
})();
