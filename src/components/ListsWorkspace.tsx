"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GameId, ListBuilderVariant, ListFieldDefinition, ListSettingsFieldDefinition, ListValidationResult, ReadyMadeSource } from "@/games/types";
import { formatNumber, type Locale } from "@/i18n";
import { featureTranslator, type FeatureTranslate } from "@/i18n/features/play";
import { deleteList, saveList } from "@/app/(app)/lists/actions";
import { games } from "@/games/registry";
import { getVariant } from "@/lib/lists/modules";
import { packLabel } from "@/lib/lists/pack-label";
import { defaultListPackId } from "@/lib/lists/default-pack";
import type { OwnerCollectionSnapshot } from "@/games/types";

type VariantView = Pick<ListBuilderVariant, "id" | "labelKey" | "fields" | "settingsFields" | "manual">;
type PackView = { id: number; source: string; sourceDate: string; importedAt: string; content: Record<string, unknown> };
type ListView = { id: number; name: string; packId: number | null; variantId: string; definition: Record<string, unknown>; validation: ListValidationResult };
type GameView = { id: GameId; world: string; nameKey: string; factionLabelKey: string };
type Props = { game: GameView; locale: Locale; variants: VariantView[]; packs: PackView[]; lists: ListView[]; collection: OwnerCollectionSnapshot };

const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const getAt = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((current, key) => record(current)[key], value);
const setAt = <T,>(value: T, path: string, next: unknown): T => {
  const keys = path.split(".");
  const result = structuredClone(value) as Record<string, unknown>;
  let cursor = result;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys.at(-1)!] = next;
  return result as T;
};

const fieldsDefault = (fields: ListFieldDefinition[]): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const path = field.path.startsWith("selections.") ? field.path.slice("selections.".length) : field.path;
    if (field.control === "repeater" || field.control === "multi-unit-picker" || field.control === "card-picker") setNested(result, path, []);
    else if (field.control === "boolean") setNested(result, path, false);
    else setNested(result, path, "");
  }
  return result;
};

function setNested(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (!node[part] || typeof node[part] !== "object") node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts.at(-1)!] = value;
}

function parseSettings(fields: ListSettingsFieldDefinition[], raw: Record<string, unknown>): Record<string, unknown> {
  const settings: Record<string, unknown> = structuredClone(raw);
  for (const field of fields) {
    const value = getAt(raw, field.path);
    if (value === undefined || value === "") continue;
    if (field.control === "json" && typeof value === "string") {
      try { setNested(settings, field.path, JSON.parse(value)); }
      catch { throw new Error("invalid-settings-json"); }
    }
    else if (field.control === "number") setNested(settings, field.path, Number(value));
    else if (field.control === "boolean") setNested(settings, field.path, value === true || value === "true");
    else if (["restrictedComponents", "bannedComponents"].includes(field.path) && typeof value === "string") {
      setNested(settings, field.path, value.split(",").map((id) => id.trim()).filter(Boolean).map((id) => ({ id })));
    }
    else if (field.control === "text" && typeof value === "string" && ["enhancementLimits", "rankLimits"].includes(field.path)) {
      const config = parseKeyValueConfig(value);
      if (config) setNested(settings, field.path, config);
    } else setNested(settings, field.path, value);
  }
  return settings;
}

function parseKeyValueConfig(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* An owner can enter key=value pairs below. */ }
  const pairs = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (!pairs.length) return undefined;
  const output: Record<string, unknown> = {};
  for (const pair of pairs) {
    const [key, raw] = pair.split("=").map((part) => part.trim());
    if (!key || !raw) return undefined;
    if (raw.includes("-") && /^\d+-\d+$/.test(raw)) {
      const [min, max] = raw.split("-").map(Number);
      output[key] = { min, max };
    } else if (/^\d+$/.test(raw)) output[key] = Number(raw);
    else return undefined;
  }
  return output;
}

function catalogOptions(pack: PackView | undefined, source: string | undefined): { id: string; name: string }[] {
  if (!pack || !source) return [];
  const catalogue = record(pack.content.catalogue);
  const options = catalogue[source];
  if (!Array.isArray(options)) return [];
  return options.flatMap((item) => {
    const v = record(item);
    return typeof v.id === "string" && typeof v.name === "string" ? [{ id: v.id, name: v.name }] : [];
  });
}

function emptyDefinition(game: GameView, variant: VariantView, pack: PackView | undefined) {
  return {
    schemaVersion: 1,
    gameId: game.id,
    name: "",
    dataPackId: pack ? String(record(pack.content).packId ?? "manual") : "manual",
    selections: fieldsDefault(variant.fields),
    settings: {},
  };
}

function flattenText(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => flattenText(item, `${path}[${index + 1}]`));
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => flattenText(item, path ? `${path}.${key}` : key));
  return value === undefined || value === null || value === "" ? [] : [`${path}: ${String(value)}`];
}

export function ListsWorkspace({ game, locale, variants, packs, lists, collection }: Props) {
  const t = featureTranslator(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<number | null>(lists[0]?.id ?? null);
  const selected = lists.find((list) => list.id === selectedId);
  const initialVariant = variants.find((variant) => variant.id === selected?.variantId) ?? variants[0];
  const [variantId, setVariantId] = useState(initialVariant?.id ?? "");
  const [packRowId, setPackRowId] = useState<number | undefined>(selected?.packId ?? defaultListPackId(packs));
  const currentPack = packs.find((pack) => pack.id === packRowId);
  const [definition, setDefinition] = useState<Record<string, unknown>>(selected?.definition ?? (initialVariant ? emptyDefinition(game, initialVariant, currentPack) : {}));
  const [savedBaseline, setSavedBaseline] = useState(JSON.stringify(selected?.definition ?? (initialVariant ? emptyDefinition(game, initialVariant, currentPack) : {})));
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteUnmatched, setPasteUnmatched] = useState<string[]>([]);
  const variant = variants.find((value) => value.id === variantId) ?? variants[0];
  const runtimeGame = games.find((candidate) => candidate.id === game.id);
  const runtimeVariant = runtimeGame ? getVariant(runtimeGame, variant?.id ?? "") : undefined;
  const currentValidation = runtimeVariant?.validateList(definition, currentPack?.content ?? {}, { collection, constraints: record(definition.settings) }) ?? { issues: [], status: "incomplete" as const };
  const dirty = JSON.stringify(definition) !== savedBaseline;
  const selections = record(definition.selections);
  const modeId = typeof definition.modeId === "string" ? definition.modeId : typeof selections.modeId === "string" ? selections.modeId : typeof selections.mode === "string" ? selections.mode : undefined;
  const options = currentPack;

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const guardNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.origin !== window.location.origin || anchor.pathname === window.location.pathname) return;
      if (!window.confirm(t("play.unsavedConfirm"))) { event.preventDefault(); event.stopPropagation(); return; }
      event.preventDefault();
      window.location.assign(anchor.href);
    };
    const guardGameChange = (event: Event) => {
      if (!window.confirm(t("play.unsavedConfirm"))) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardNavigation, true);
    window.addEventListener("tabletop:before-game-change", guardGameChange);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardNavigation, true); window.removeEventListener("tabletop:before-game-change", guardGameChange); };
  }, [dirty, t]);

  const confirmDiscard = () => !dirty || window.confirm(t("play.unsavedConfirm"));
  const startNew = () => {
    if (!confirmDiscard()) return;
    const nextVariant = variants.find((candidate) => candidate.id === variantId) ?? variants[0];
    if (!nextVariant) return;
    const nextPack = packs.find((pack) => pack.id === packRowId);
    setSelectedId(null);
    setDefinition(emptyDefinition(game, nextVariant, nextPack));
    setSavedBaseline(JSON.stringify(emptyDefinition(game, nextVariant, nextPack)));
    setStatus("");
    setPasteUnmatched([]);
  };

  const selectList = (list: ListView) => {
    if (!confirmDiscard()) return;
    const nextVariant = variants.find((candidate) => candidate.id === list.variantId) ?? variants[0];
    setSelectedId(list.id);
    setVariantId(nextVariant?.id ?? "");
    setPackRowId(list.packId ?? undefined);
    setDefinition(list.definition);
    setSavedBaseline(JSON.stringify(list.definition));
    setStatus("");
    setPasteUnmatched([]);
  };

  const onTopField = (path: string, value: unknown) => setDefinition((current) => setAt(current, path, value));
  const onSelectionField = (path: string, value: unknown) => {
    setDefinition((current) => {
      let next = setAt(current, path, value);
      if (path.endsWith(".unitId")) {
        const choice = catalogOptions(options, "units").find((item) => item.id === value);
        if (choice) next = setAt(next, `${path.slice(0, path.lastIndexOf("."))}.name`, choice.name);
      }
      return next;
    });
  };

  async function save() {
    if (!variant) return;
    setBusy(true);
    setStatus("");
    let data: Record<string, unknown>;
    try {
      data = { ...definition, id: selected?.id ? String(selected.id) : undefined, settings: parseSettings(variant.settingsFields, record(definition.settings)) };
    } catch {
      setStatus(t("play.invalidSettingsJson"));
      setBusy(false);
      return;
    }
    try {
    const saved = await saveList({ gameId: game.id, listId: selected?.id, packRowId, variantId: variant.id, definition: data });
    if (!saved.ok) {
      setStatus(t(`play.error.${saved.error}`));
      setBusy(false);
      return;
    }
    setStatus(saved.value.validation.status === "incomplete" ? t("play.incompleteValidation") : t("play.saved"));
    setSelectedId(saved.value.id);
    setDefinition(data);
    setSavedBaseline(JSON.stringify(data));
    setBusy(false);
    router.refresh();
    } catch {
      setStatus(t("play.error.list-save-failed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeList() {
    if (!selected) return;
    if (!window.confirm(t("play.deleteListConfirm", { name: selected.name }))) return;
    const result = await deleteList({ gameId: game.id, listId: selected.id });
    if (!result.ok) { setStatus(t(`play.error.${result.error}`)); return; }
    setSelectedId(null);
    const nextVariant = variants.find((candidate) => candidate.id === variantId) ?? variants[0];
    if (nextVariant) {
      const empty = emptyDefinition(game, nextVariant, currentPack);
      setDefinition(empty);
      setSavedBaseline(JSON.stringify(empty));
    }
    setStatus("");
    router.refresh();
  }

  function importPasted() {
    const importText = runtimeVariant?.importText;
    if (!importText || !variant || !pasteText.trim() || !confirmDiscard()) return;
    const result = importText(pasteText, packs.map(({ id, content }) => ({ id, content })));
    const nextPack = packs.find((pack) => pack.id === result.packRowId);
    const entries = getAt(result.definition, "selections.entries");
    const count = Array.isArray(entries) ? entries.length : 0;
    setSelectedId(null);
    if (result.packRowId !== undefined) setPackRowId(result.packRowId);
    setDefinition(result.definition as unknown as Record<string, unknown>);
    // The draft is unsaved: the baseline stays an empty list, so leaving asks first.
    setSavedBaseline(JSON.stringify(emptyDefinition(game, variant, nextPack)));
    setPasteUnmatched(result.unmatched);
    setStatus(result.packRowId === undefined ? t("play.paste.noPack") : t("play.paste.imported", { count: formatNumber(locale, count) }));
  }

  function exportList() {
    const lines = [`${t("play.listName")}: ${String(definition.name ?? "")}`, `${t("play.importedPack")}: ${String(definition.dataPackId ?? "")}`, ...flattenText(definition.selections, t("play.selection"))];
    const file = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${String(definition.name || game.id).replace(/[^\p{L}\p{N}-]+/gu, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="lists-workspace">
      <section className="w-card lists-index" aria-label={t("play.savedLists")}>
        <header className="list-panel-head">
          <div>
            <h1 className="w-display page-title">{t("play.listBuilder")}</h1>
            <div className="label">{t(game.nameKey)}</div>
          </div>
          <button type="button" className="btn" onClick={startNew}>{t("play.newList")}</button>
        </header>
        <label className="field-label" htmlFor="pack-selector">{t("play.importedPack")}</label>
        <select id="pack-selector" value={packRowId ?? "manual"} onChange={(event) => {
          if (!confirmDiscard()) return;
          const id = event.target.value === "manual" ? undefined : Number(event.target.value);
          setPackRowId(id);
          const pack = packs.find((candidate) => candidate.id === id);
          setDefinition((current) => setAt(current, "dataPackId", pack ? String(record(pack.content).packId ?? "manual") : "manual"));
        }}>
          <option value="manual">{t("play.manualPack")}</option>
          {packs.map((pack) => <option key={pack.id} value={pack.id}>{packLabel(pack)}</option>)}
        </select>
        {packs.length === 0 && <p className="hint">{t("play.noPack")}</p>}
        <div className="w-rule" />
        <div className="lists-index-items">
          {lists.map((list) => (
            <button key={list.id} type="button" className="list-index-row" aria-current={list.id === selectedId ? "true" : undefined} onClick={() => selectList(list)}>
              <span className="strong">{list.name}</span>
              <span className="label">{t(variants.find((item) => item.id === list.variantId)?.labelKey ?? "play.listBuilder")}</span>
              <span className={`validation-status ${list.validation.status}`}>{list.validation.status === "complete" ? t("play.completeValidation") : t("play.incompleteValidation")}</span>
            </button>
          ))}
          {!lists.length && <p className="hint">{t("play.noLists")}</p>}
        </div>
        <div className="w-rule" />
        <p className="hint" style={{ overflowWrap: "anywhere" }}>{t("play.packRevision")}: {currentPack ? `${currentPack.sourceDate} · ${String(record(currentPack.content).revision ?? "")}` : t("play.manualPack")}</p>
      </section>

      <section className="w-card list-editor card-pad">
        {!variant ? <p>{t("play.noBuilder")}</p> : <>
          <div className="list-editor-head">
            <div className="list-editor-title">
              <label className="field-label" htmlFor="list-name">{t("play.listName")}</label>
              <input id="list-name" type="text" required value={String(definition.name ?? "")} onChange={(event) => onTopField("name", event.target.value)} />
            </div>
            {variants.length > 1 && <label className="field-label">{t("play.listType")}
              <select value={variant.id} onChange={(event) => { if (!confirmDiscard()) return; const next = variants.find((candidate) => candidate.id === event.target.value); if (next) { setVariantId(next.id); setSelectedId(null); const empty = emptyDefinition(game, next, currentPack); setDefinition(empty); setSavedBaseline(JSON.stringify(empty)); } }}>
                {variants.map((item) => <option key={item.id} value={item.id}>{t(item.labelKey)}</option>)}
              </select>
            </label>}
          </div>
          {variant.manual && <p className="manual-note">{t("play.manualEntry")}</p>}
          {runtimeVariant?.importText && <details className="settings-panel list-paste">
            <summary>{t("play.paste.title")}</summary>
            <p className="hint">{t("play.paste.help")}</p>
            <label className="field-label" htmlFor="list-paste-text">{t("play.paste.label")}
              <textarea id="list-paste-text" rows={10} spellCheck={false} value={pasteText} onChange={(event) => setPasteText(event.target.value)} />
            </label>
            <div><button type="button" className="btn secondary" disabled={!pasteText.trim()} onClick={importPasted}>{t("play.paste.import")}</button></div>
            {pasteUnmatched.length > 0 && <div role="status">
              <p className="hint">{t("play.paste.unmatched", { count: formatNumber(locale, pasteUnmatched.length) })}</p>
              <ul className="hint">{pasteUnmatched.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}</ul>
            </div>}
          </details>}
          <div className="list-fields">
            {variant.fields.map((field) => renderField(field, definition, (path, value) => onSelectionField(path, value), "", options, t))}
          </div>
          {runtimeVariant?.readyMade && getAt(definition, runtimeVariant.readyMade.when.path) === runtimeVariant.readyMade.when.value && <ReadyMadePicker
            source={runtimeVariant.readyMade}
            pack={currentPack}
            selectedId={getAt(definition, runtimeVariant.readyMade.selectedPath)}
            locale={locale}
            t={t}
            onPick={(id) => {
              const source = runtimeVariant.readyMade;
              const picked = source && currentPack ? source.apply(currentPack.content, id) : undefined;
              if (!source || !picked) return;
              const entries = getAt(definition, "selections.entries");
              const name = source.options(currentPack?.content).find((option) => option.id === id)?.name ?? id;
              if (Array.isArray(entries) && entries.length > 0 && !window.confirm(t(source.labelKeys.replaceConfirm, { name }))) return;
              setDefinition((current) => setAt(current, "selections", picked.selections));
              setStatus(picked.unlinkedCount > 0 ? t(source.labelKeys.unlinked, { count: formatNumber(locale, picked.unlinkedCount) }) : "");
            }}
          />}
          {modeId && <p className="hint"><Link className="touch-link" href={`/reference?gameId=${encodeURIComponent(game.id)}&recordId=${encodeURIComponent(modeId)}`}>{t("play.modeReference")}</Link></p>}
          {!!variant.settingsFields.length && <section className="settings-panel">
            <h2>{t("play.manualSettings")}</h2>
            <p className="hint">{t("play.settingsOwnerEntered")}</p>
            <div className="list-fields">
              {variant.settingsFields.map((field) => renderSettingsField(field, record(definition.settings), (path, value) => setDefinition((current) => setAt(current, `settings.${path}`, value)), currentPack, t))}
            </div>
          </section>}
          {(currentValidation.status === "incomplete" || currentValidation.issues.length > 0) && <section className="validation-panel" aria-live="polite">
            <h2>{t("play.validation")}</h2>
            <p className="validation-status incomplete">{t("play.incompleteValidation")}</p>
            {currentValidation.issues.map((issue, index) => <p key={`${issue.rule}-${index}`} className={`validation-issue ${issue.severity}`}><strong>{t(`play.${issue.severity}`)}</strong> {t(issue.messageKey, issue.values)}</p>)}
          </section>}
          {currentValidation.status === "complete" && currentValidation.issues.length === 0 && <p className="validation-status complete">{t("play.completeValidation")}</p>}
          {status && <p role="status">{status}</p>}
          <footer className="list-editor-actions">
            <button type="button" className="btn secondary" onClick={exportList}>{t("play.exportList")}</button>
            {selected && <button type="button" className="btn danger" onClick={removeList}>{t("play.deleteList")}</button>}
            <button type="button" className="btn" disabled={pending || busy || !String(definition.name ?? "").trim()} onClick={() => startTransition(() => { void save(); })}>{t("play.saveList")}</button>
          </footer>
        </>}
      </section>
    </div>
  );
}

function ReadyMadePicker({ source, pack, selectedId, locale, t, onPick }: { source: ReadyMadeSource; pack: PackView | undefined; selectedId: unknown; locale: Locale; t: FeatureTranslate; onPick: (id: string) => void }) {
  const words = source.labelKeys;
  const options = pack ? source.options(pack.content) : [];
  return <section className="settings-panel" aria-labelledby="ready-made-title">
    <h2 id="ready-made-title">{t(words.title)}</h2>
    {!pack && <p className="hint">{t(words.noPack)}</p>}
    {pack && options.length === 0 && <>
      <p className="hint">{t(words.empty)}</p>
      <p className="hint"><Link href="/data">{t(words.dataLink)}</Link></p>
    </>}
    {options.length > 0 && <>
      <p className="hint">{t(words.help)}</p>
      <div className="lists-index-items">
        {options.map((option) => <button key={option.id} type="button" className="list-index-row" aria-current={option.id === selectedId ? "true" : undefined} onClick={() => onPick(option.id)}>
          <span className="strong">{option.name}</span>
          <span className="label">{option.factionName ?? t(words.noFaction)} · <span className="num">{t(words.units, { count: formatNumber(locale, option.unitCount) })}</span></span>
          <span className={`validation-status ${option.configured ? "complete" : "incomplete"}`}>{option.configured ? t(words.configured) : t(words.incomplete)}</span>
        </button>)}
      </div>
    </>}
  </section>;
}

function renderSettingsField(field: ListSettingsFieldDefinition, values: Record<string, unknown>, onChange: (path: string, value: unknown) => void, pack: PackView | undefined, t: FeatureTranslate) {
  const source = field.optionsSource;
  const choices = catalogOptions(pack, source);
  const value = getAt(values, field.path);
  const id = `setting-${field.path.replaceAll(".", "-")}`;
  return <label key={field.path} className="field-label" htmlFor={id}>
    {t(field.labelKey)}{field.required ? " *" : ""}
    <FieldInput id={id} control={field.control} options={choices} value={field.control === "json" && typeof value !== "string" ? JSON.stringify(value ?? [], null, 2) : value} onValue={(next) => onChange(field.path, next)} t={t} />
  </label>;
}

function renderField(field: ListFieldDefinition, values: Record<string, unknown>, onChange: (path: string, value: unknown) => void, base: string, pack: PackView | undefined, t: FeatureTranslate) {
  const path = field.path.startsWith("selections.") ? field.path : base ? `${base}.${field.path}` : `selections.${field.path}`;
  const value = getAt(values, path);
  const id = `field-${path.replaceAll(".", "-")}`;
  if (field.hiddenWhen && getAt(values, field.hiddenWhen.path) === field.hiddenWhen.value) return null;
  if (field.control === "repeater") {
    const rows = Array.isArray(value) ? value : [];
    return <fieldset className="repeater-field" key={path}>
      <legend className="field-label">{t(field.labelKey)}</legend>
      {rows.map((_, index) => {
        const itemPath = `${path}.${index}`;
        return <div className="repeater-row" key={`${path}-${index}`}>
          <div className="list-fields">
            {(field.itemFields ?? []).map((child) => renderField(child, values, (childPath, next) => {
              const changed = setAt(values, childPath, next);
              const currentRows = getAt(changed, path);
              if (Array.isArray(currentRows)) onChange(path, currentRows);
            }, itemPath, pack, t))}
          </div>
          <button type="button" className="btn secondary" aria-label={t("play.removeEntry")} onClick={() => onChange(path, rows.filter((_, rowIndex) => rowIndex !== index))}>{t("play.removeEntry")}</button>
        </div>;
      })}
      <button type="button" className="btn secondary" onClick={() => onChange(path, [...rows, fieldsDefault(field.itemFields ?? [])])}>{t("play.addEntry")}</button>
    </fieldset>;
  }
  if (field.choices?.length) {
    return <label key={path} className="field-label" htmlFor={id}>
      {t(field.labelKey)}{field.required ? " *" : ""}
      <select id={id} value={String(value ?? "")} onChange={(event) => onChange(path, event.target.value)}>
        <option value="">{t("play.chooseOne")}</option>
        {field.choices.map((choice) => <option key={choice.id} value={choice.id}>{t(choice.labelKey)}</option>)}
      </select>
    </label>;
  }
  const options = catalogOptions(pack, field.optionsSource);
  return <label key={path} className="field-label" htmlFor={id}>
    {t(field.labelKey)}{field.required ? " *" : ""}
    <FieldInput id={id} control={field.control} options={options} value={value} onValue={(next) => onChange(path, next)} t={t} />
  </label>;
}

function FieldInput({ id, control, options, value, onValue, t }: { id: string; control: string; options: { id: string; name: string }[]; value: unknown; onValue: (value: unknown) => void; t: FeatureTranslate }) {
  if (control === "json") return <textarea id={id} rows={5} spellCheck={false} value={String(value ?? "")} onChange={(event) => onValue(event.target.value)} />;
  if (control === "boolean") return <input id={id} type="checkbox" checked={value === true} onChange={(event) => onValue(event.target.checked)} />;
  if (control === "number") return <input id={id} type="number" inputMode="numeric" value={String(value ?? "")} onChange={(event) => onValue(event.target.value === "" ? "" : Number(event.target.value))} />;
  if (control === "multi-unit-picker" || control === "card-picker") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return <span className="field-stack">
      {options.length > 0 && <select id={id} multiple size={Math.min(5, Math.max(2, options.length))} value={selected.filter((item) => options.some((option) => option.id === item))} onChange={(event) => onValue([...new Set([...Array.from(event.target.selectedOptions, (option) => option.value), ...selected.filter((item) => !options.some((option) => option.id === item))])])}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>}
      <input type="text" aria-label={t("play.manualIds")} placeholder={t("play.manualIds")} value={selected.filter((item) => !options.some((option) => option.id === item)).join(", ")} onChange={(event) => onValue([...selected.filter((item) => options.some((option) => option.id === item)), ...event.target.value.split(",").map((item) => item.trim()).filter(Boolean)])} />
    </span>;
  }
  if ((control === "select" || control === "unit-picker" || control === "faction-picker") && options.length) {
    return <span className="field-stack">
      <select id={id} value={String(value ?? "")} onChange={(event) => onValue(event.target.value)}>
        <option value="">{t("play.chooseOrEnter")}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      <input type="text" aria-label={t("play.manualId")} placeholder={t("play.manualId")} value={String(value ?? "")} onChange={(event) => onValue(event.target.value)} />
    </span>;
  }
  return <input id={id} type="text" value={String(value ?? "")} onChange={(event) => onValue(event.target.value)} />;
}
