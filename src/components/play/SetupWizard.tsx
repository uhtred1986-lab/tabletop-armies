"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { CataloguePack, ListValidationResult } from "@/games/types";
import type { Locale } from "@/i18n";
import { startGame } from "@/app/(app)/play/actions";
import { featureTranslator } from "@/i18n/features/play";
import { payloadHash } from "@/lib/play/offline-store";
import type { PlayModuleSnapshot, PlaySide, PlayStartSnapshot } from "@/lib/play/replay";
import { forMode, type SetupSource } from "@/lib/play/setup-source";
import { packLabel } from "@/lib/lists/pack-label";
import { BattleplanMap } from "./BattleplanMap";

export type SetupList = { id: number; name: string; definition: Record<string, unknown>; validation: ListValidationResult; variantId: string; packId: number | null };
export type SetupPack = { id: number; sourceDate: string; source: string; revision: string; content: CataloguePack };

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const withoutUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).map(([key, item]) => [key, withoutUndefined(item)]));
  return value;
};
const unique = <T,>(items: T[], key: (item: T) => string) => [...new Map(items.map((item) => [key(item), item])).values()];
const sides: PlaySide[] = ["owner", "opponent"];

function catalogueUnits(pack?: SetupPack): { id: string; name: string }[] {
  const units = record(pack?.content.catalogue).units;
  return Array.isArray(units) ? units.flatMap((item) => {
    const row = record(item);
    return typeof row.id === "string" && typeof row.name === "string" ? [{ id: row.id, name: row.name }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name)) : [];
}

function factionNames(pack?: SetupPack): string {
  const factions = record(pack?.content.catalogue).factions;
  return Array.isArray(factions) ? factions.map((item) => String(record(item).name ?? "")).filter((name) => /^\p{L}/u.test(name)).join(", ") : "";
}

export function unitsForList(list: SetupList, pack?: SetupPack): { id: string; name: string }[] {
  const known = new Map(catalogueUnits(pack).map((unit) => [unit.id, unit.name]));
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

const subscribeOnline = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
};

type Step = "players" | "battleplan" | "rollOffs" | "ready";

/**
 * The guided pre-game (issue #9): players → battleplan → roll-offs → ready. Games without a guided setup keep one page.
 * Everything chosen here is frozen into the game_started snapshot.
 */
export function SetupWizard({ locale, game, lists, packs, currentPack, setupSource }: { locale: Locale; game: PlayModuleSnapshot; lists: SetupList[]; packs: SetupPack[]; currentPack?: SetupPack; setupSource: SetupSource }) {
  const t = featureTranslator(locale);
  const router = useRouter();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const guided = !!game.setup;
  const steps: Step[] = guided ? ["players", "battleplan", "rollOffs", "ready"] : ["players"];
  const [step, setStep] = useState(0);
  const [opponentName, setOpponentName] = useState("");
  const [opponentPackId, setOpponentPackId] = useState<number | "">("");
  const [opponentFaction, setOpponentFaction] = useState("");
  const [opponentListName, setOpponentListName] = useState("");
  const [ownListIds, setOwnListIds] = useState<number[]>([]);
  const [opponentUnitIds, setOpponentUnitIds] = useState<string[]>([]);
  const [manualOpponentUnits, setManualOpponentUnits] = useState("");
  const [battleplanId, setBattleplanId] = useState("");
  const [rollOffs, setRollOffs] = useState<Record<string, PlaySide>>({});
  const [photoReminder, setPhotoReminder] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState("");

  const chosenLists = lists.filter((list) => ownListIds.includes(list.id));
  const mode = chosenLists.map((list) => record(list.definition.selections).mode ?? list.definition.modeId).find((value): value is string => typeof value === "string");
  const battleplans = forMode(setupSource.battleplans, mode);
  const tactics = forMode(setupSource.tactics, mode);
  const battleplan = battleplans.find((plan) => plan.id === battleplanId);
  const opponentPack = packs.find((pack) => pack.id === opponentPackId);
  const opponentOptions = catalogueUnits(opponentPack ?? (packs.length === 1 ? packs[0] : undefined));
  const playersReady = !!opponentName.trim() && ownListIds.length > 0;
  const current = steps[step]!;

  function randomize() {
    if (!battleplans.length) return;
    const bytes = new Uint32Array(1); crypto.getRandomValues(bytes);
    setBattleplanId(battleplans[bytes[0]! % battleplans.length]!.id);
  }

  async function start() {
    if (!navigator.onLine || starting || !playersReady) return;
    const selectedOpponentUnits = opponentOptions.filter((unit) => opponentUnitIds.includes(unit.id));
    const customOpponentUnits: { id?: string; name: string }[] = manualOpponentUnits.split(",").map((name) => name.trim()).filter(Boolean).map((name, index) => ({ id: `manual-${index + 1}-${name}`, name }));
    const opponentUnits = unique([...selectedOpponentUnits, ...customOpponentUnits], (unit) => unit.id ?? unit.name);
    const ownerFaction = chosenLists.map((list) => {
      const selections = record(list.definition.selections);
      return typeof list.definition.factionId === "string" ? list.definition.factionId : typeof selections.factionId === "string" ? selections.factionId : undefined;
    }).find(Boolean);
    const faction = (opponentPack ? factionNames(opponentPack) : opponentFaction).trim() || undefined;
    const snapshot: PlayStartSnapshot = {
      schemaVersion: 1,
      gameId: game.id,
      module: game,
      modeId: chosenLists[0] && (chosenLists[0].definition.modeId as string | undefined),
      ...(guided ? { setup: {
        ...(battleplan ? { battleplan: { id: battleplan.id, name: battleplan.name, scoring: battleplan.scoring, ...(battleplan.number ? { number: battleplan.number } : {}), ...(battleplan.map ? { map: battleplan.map } : {}) } } : {}),
        tactics: tactics.map((tactic) => ({ id: tactic.id, name: tactic.name, ...(tactic.points !== undefined ? { points: tactic.points } : {}) })),
        rollOffs,
        ...(photoReminder ? { photoReminder } : {}),
      } } : {}),
      sides: {
        owner: { factionId: ownerFaction, listIds: chosenLists.map((list) => list.id), lists: chosenLists.map((list) => ({ id: list.id, name: list.name, selections: list.definition })), units: chosenLists.flatMap((list) => unitsForList(list, packs.find((pack) => pack.id === list.packId) ?? currentPack)) },
        opponent: { name: opponentName.trim(), factionId: faction, listName: opponentListName.trim() || undefined, units: opponentUnits },
      },
    };
    const payload = { gameId: game.id, listIds: chosenLists.map((list) => list.id), opponentName: opponentName.trim(), opponentFaction: faction, opponentList: opponentListName.trim() || undefined, opponentUnits, snapshot };
    const operationId = crypto.randomUUID();
    const hash = await payloadHash(withoutUndefined(payload));
    setStarting(true);
    setStatus("");
    const result = await startGame({ ...payload, operationId, payloadHash: hash });
    if (!result.ok) { setStatus(t(`play.error.${result.error}`)); setStarting(false); return; }
    router.push(`/play?id=${result.value.playedGameId}`);
    router.refresh();
  }

  const sideButtons = (value: PlaySide | undefined, onPick: (side: PlaySide) => void, label: string) => <div className="segmented" role="group" aria-label={label}>
    {sides.map((side) => <button type="button" key={side} aria-pressed={value === side} onClick={() => onPick(side)}>{side === "owner" ? t("setup.you") : t("setup.opponent")}</button>)}
  </div>;

  return <section className="w-card card-pad play-start-form setup-wizard">
    <h1 className="w-display page-title">{t("play.title")}</h1>
    {guided && <ol className="setup-steps" aria-label={t("setup.stepOf", { step: step + 1, total: steps.length })}>
      {steps.map((item, index) => <li key={item} aria-current={index === step ? "step" : undefined} className={index < step ? "done" : undefined}>{t(`setup.step.${item}`)}</li>)}
    </ol>}

    {current === "players" && <div className="setup-body">
      {!guided && <p className="hint">{t("play.startDescription")}</p>}
      <fieldset className="play-list-choice">
        <legend>{t("setup.you")} · {t("play.ownLists")}</legend>
        {lists.length ? lists.map((list) => (
          <label className="list-choice" key={list.id}>
            <input type="checkbox" checked={ownListIds.includes(list.id)} onChange={(event) => setOwnListIds((ids) => event.target.checked ? [...ids, list.id] : ids.filter((id) => id !== list.id))} />
            <span>{list.name}</span>
            <small className={`validation-status ${list.validation.status}`}>{list.validation.status === "complete" ? t("play.completeValidation") : t("play.incompleteValidation")}</small>
          </label>
        )) : <p className="hint">{t("play.noListsForGame")} <Link href="/lists" className="touch-link">{t("play.listBuilder")}</Link></p>}
      </fieldset>
      <fieldset className="setup-opponent">
        <legend>{t("setup.opponent")}</legend>
        <label className="field-label">{t("play.opponentName")} *<input value={opponentName} onChange={(event) => setOpponentName(event.target.value)} required /></label>
        {packs.length > 1 && <label className="field-label">{t("setup.opponentPack")}<select value={opponentPackId} onChange={(event) => { setOpponentPackId(event.target.value ? Number(event.target.value) : ""); setOpponentUnitIds([]); }}>
          <option value="">{t("setup.opponentPackNone")}</option>
          {packs.map((pack) => <option key={pack.id} value={pack.id}>{packLabel(pack)}</option>)}
        </select></label>}
        {!opponentPack && <label className="field-label">{packs.length > 1 ? t("setup.opponentFactionName") : t("play.opponentFaction")}<input value={opponentFaction} onChange={(event) => setOpponentFaction(event.target.value)} /></label>}
        <label className="field-label">{t("play.opponentList")}<input value={opponentListName} onChange={(event) => setOpponentListName(event.target.value)} /></label>
        <label className="field-label">{t("play.opponentUnits")}
          {opponentOptions.length > 0 && <select multiple size={Math.min(6, Math.max(2, opponentOptions.length))} value={opponentUnitIds} onChange={(event) => setOpponentUnitIds(Array.from(event.target.selectedOptions, (option) => option.value))}>
            {opponentOptions.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>}
          <input value={manualOpponentUnits} onChange={(event) => setManualOpponentUnits(event.target.value)} placeholder={t("play.manualOpponentUnits")} />
        </label>
      </fieldset>
      {!ownListIds.length && <p className="hint">{t("play.selectOwnList")}</p>}
    </div>}

    {current === "battleplan" && <div className="setup-body">
      <p className="hint">{t("setup.battleplanHelp")}</p>
      {battleplans.length ? <>
        <button type="button" className="btn secondary setup-randomize" onClick={randomize}>{t("setup.randomize")}</button>
        <div className="battleplan-list" role="radiogroup" aria-label={t("setup.step.battleplan")}>
          <label className="battleplan-option"><input type="radio" name="battleplan" checked={!battleplanId} onChange={() => setBattleplanId("")} /><span className="battleplan-number" aria-hidden="true">–</span><span>{t("setup.noBattleplan")}</span></label>
          {battleplans.map((plan) => <label className="battleplan-option" key={plan.id}>
            <input type="radio" name="battleplan" checked={battleplanId === plan.id} onChange={() => setBattleplanId(plan.id)} />
            <span className="battleplan-number num">{plan.number ?? "·"}</span><span>{plan.name}</span>
          </label>)}
        </div>
        {battleplan && <div className="battleplan-detail">
          {battleplan.map ? <BattleplanMap map={battleplan.map} t={t} /> : <p className="hint">{t("setup.noMap")}</p>}
          {battleplan.scoring.length > 0 && <div><span className="label">{t("setup.scoring")}</span><ul className="battleplan-scoring">{battleplan.scoring.map((rule) => <li key={rule.id}>{rule.label} · {t("setup.points", { points: rule.points })}</li>)}</ul></div>}
        </div>}
      </> : <p className="hint">{t("setup.noBattleplans")} <Link href="/data" className="touch-link">{t("setup.dataLink")}</Link></p>}
    </div>}

    {current === "rollOffs" && <div className="setup-body">
      {battleplan?.map && <BattleplanMap map={battleplan.map} t={t} />}
      {game.setup?.rollOffs.map((rollOff) => <div className="setup-rolloff" key={rollOff.id}>
        <div><strong>{t(rollOff.label)}</strong><p className="hint">{t(rollOff.help)}</p></div>
        {sideButtons(rollOffs[rollOff.id], (side) => setRollOffs((current) => ({ ...current, [rollOff.id]: side })), t(rollOff.label))}
      </div>)}
      <label className="setup-toggle"><input type="checkbox" checked={photoReminder} onChange={(event) => setPhotoReminder(event.target.checked)} /><span><strong>{t("setup.photoReminder")}</strong><small className="hint">{t("setup.photoReminderHelp")}</small></span></label>
    </div>}

    {current === "ready" && <div className="setup-body">
      <h2>{t("setup.summary")}</h2>
      <dl className="setup-summary">
        <dt>{t("setup.you")}</dt><dd>{chosenLists.map((list) => list.name).join(", ")}</dd>
        <dt>{t("setup.opponent")}</dt><dd>{opponentName}{(opponentPack ? factionNames(opponentPack) : opponentFaction) ? ` · ${opponentPack ? factionNames(opponentPack) : opponentFaction}` : ""}</dd>
        <dt>{t("setup.step.battleplan")}</dt><dd>{battleplan ? `${battleplan.number ? `${battleplan.number} · ` : ""}${battleplan.name}` : t("setup.noBattleplan")}</dd>
        {game.setup?.rollOffs.map((rollOff) => <div key={rollOff.id} className="setup-summary-row"><dt>{t(rollOff.label)}</dt><dd>{rollOffs[rollOff.id] ? (rollOffs[rollOff.id] === "owner" ? t("setup.you") : t("setup.opponent")) : t("setup.notChosen")}</dd></div>)}
      </dl>
      <p className="hint">{t("play.startValidationNote")}</p>
    </div>}

    {status && <p role="status">{status}</p>}
    <div className="setup-nav">
      {step > 0 && <button type="button" className="btn secondary" onClick={() => setStep(step - 1)}>{t("setup.back")}</button>}
      {step < steps.length - 1
        ? <button type="button" className="btn" disabled={current === "players" && !playersReady} onClick={() => setStep(step + 1)}>{t("setup.next")}</button>
        : <button type="button" className="btn" disabled={starting || !playersReady || !online} onClick={() => void start()}>{t("play.start")}</button>}
    </div>
    {!online && <p className="hint">{t("play.startOnlineOnly")}</p>}
  </section>;
}
