import Link from "next/link";
import type { ReactNode } from "react";
import { and, asc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  campaigns,
  campaignGames,
  campaignRenownEvents,
  campaignRosterUnits,
  campaignTerritories,
  campaignUnitInjuries,
  collectionItems,
  gameEvents,
  playedGames,
} from "@/db/schema";
import { GameSwitcher } from "@/components/GameSwitcher";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { ActionForm, type FormAction } from "@/features/campaigns/ActionForm";
import { ConfirmAction } from "@/features/campaigns/ConfirmAction";
import styles from "@/features/campaigns/campaigns.module.css";
import { buildLadder, unitHistory, type CampaignGame, type CampaignUnitRef } from "@/features/campaigns/domain";
import { formatNumber } from "@/i18n";
import type { StringKey } from "@/i18n";
import { getLocale, getT } from "@/i18n/server";
import { currentGame } from "@/lib/current-game";
import {
  addRenownEvent,
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
} from "../actions";

export const dynamic = "force-dynamic";

type RuleValue = { name: string; value: string; source?: string };

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function outcome(value: unknown): CampaignGame["result"] {
  return value === "win" || value === "loss" || value === "draw" ? value : null;
}

function unitRefs(value: unknown): CampaignUnitRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = object(item);
    return typeof row?.name === "string" ? [{ id: typeof row.id === "string" ? row.id : null, name: row.name }] : [];
  });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span className="label">{label}</span>{children}</label>;
}

function ConfirmDelete({ triggerKey, warning, action, fields, actionKey = "campaigns.delete", successHref }: { triggerKey: StringKey; warning: string; action: FormAction; fields: ReactNode; actionKey?: StringKey; successHref?: string }) {
  return (
    <ConfirmAction triggerKey={triggerKey} confirmText={warning} action={action} actionKey={actionKey} fields={fields} successHref={successHref} />
  );
}

function resultText(result: CampaignGame["result"], t: (key: StringKey) => string) {
  return result ? t(`history.outcome.${result}` as StringKey) : t("history.pending");
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, locale, game, routeParams] = await Promise.all([getT(), getLocale(), currentGame(), params]);
  const id = Number(routeParams.id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign || campaign.gameId !== game.id) notFound();
  const [linked, roster, territories, collection] = await Promise.all([
    db.select({ link: campaignGames, game: playedGames }).from(campaignGames).leftJoin(playedGames, eq(campaignGames.playedGameId, playedGames.id)).where(eq(campaignGames.campaignId, id)).orderBy(asc(campaignGames.sortOrder)),
    db.select().from(campaignRosterUnits).where(eq(campaignRosterUnits.campaignId, id)).orderBy(asc(campaignRosterUnits.sortOrder), asc(campaignRosterUnits.id)),
    db.select().from(campaignTerritories).where(eq(campaignTerritories.campaignId, id)).orderBy(asc(campaignTerritories.name)),
    db.select().from(collectionItems).where(eq(collectionItems.gameId, campaign.gameId)).orderBy(asc(collectionItems.unitName)),
  ]);
  const linkedIds = linked.flatMap(({ game: row }) => row ? [row.id] : []);
  const completionRows = await db.select({ game: playedGames, playedGameId: gameEvents.playedGameId, payload: gameEvents.payload })
    .from(gameEvents).innerJoin(playedGames, eq(gameEvents.playedGameId, playedGames.id))
    .where(and(eq(gameEvents.kind, "game_completed"), eq(playedGames.gameId, campaign.gameId), isNotNull(playedGames.result)))
    .orderBy(asc(gameEvents.seq));
  const completionState = new Map<number, boolean>();
  for (const row of completionRows) {
    const payload = object(row.payload);
    const eventResult = outcome(payload?.result);
    completionState.set(row.playedGameId, !!eventResult && eventResult === row.game.result);
  }
  const completedIds = [...completionState].filter(([, completed]) => completed).map(([gameId]) => gameId);
  const eligible = completedIds.length > 0
    ? await db.select().from(playedGames).where(linkedIds.length
      ? and(eq(playedGames.gameId, campaign.gameId), inArray(playedGames.id, completedIds), notInArray(playedGames.id, linkedIds))
      : and(eq(playedGames.gameId, campaign.gameId), inArray(playedGames.id, completedIds)))
      .orderBy(asc(playedGames.playedOn), asc(playedGames.id))
    : [];
  const eventRows = linkedIds.length ? await db.select().from(gameEvents).where(and(inArray(gameEvents.playedGameId, linkedIds), inArray(gameEvents.kind, ["game_started", "game_completed"]))).orderBy(asc(gameEvents.seq)) : [];
  const snapshots = new Map<number, Record<string, unknown>>();
  const eventOutcomes = new Map<number, CampaignGame["result"]>();
  for (const event of eventRows) {
    const payload = object(event.payload);
    const snapshot = object(payload?.snapshot);
    if (event.kind === "game_started" && snapshot) snapshots.set(event.playedGameId, snapshot);
    if (event.kind === "game_completed") eventOutcomes.set(event.playedGameId, outcome(payload?.result));
  }
  const campaignGamesForDomain: CampaignGame[] = linked.flatMap(({ game: row }) => {
    if (!row) return [];
    const snapshot = snapshots.get(row.id);
    const sides = object(snapshot?.sides);
    const owner = object(sides?.owner);
    const opponent = object(sides?.opponent);
    return [{
      id: row.id,
      playedOn: row.playedOn,
      opponent: typeof opponent?.name === "string" ? opponent.name : row.opponent,
      result: eventOutcomes.get(row.id) ?? outcome(row.result),
      ownerUnits: unitRefs(owner?.units),
      opponentUnits: unitRefs(opponent?.units),
    }];
  });
  const configObject = object(campaign.config);
  const ownerLabel = typeof configObject?.ownerLabel === "string" && configObject.ownerLabel.trim() ? configObject.ownerLabel.trim() : t("campaigns.you");
  const ladder = buildLadder(campaignGamesForDomain, ownerLabel);
  const rosterIds = roster.map((unit) => unit.id);
  const [renownEvents, injuries] = await Promise.all([
    rosterIds.length ? db.select().from(campaignRenownEvents).where(inArray(campaignRenownEvents.rosterUnitId, rosterIds)).orderBy(asc(campaignRenownEvents.occurredOn), asc(campaignRenownEvents.id)) : Promise.resolve([]),
    rosterIds.length ? db.select().from(campaignUnitInjuries).where(inArray(campaignUnitInjuries.rosterUnitId, rosterIds)).orderBy(asc(campaignUnitInjuries.incurredOn), asc(campaignUnitInjuries.id)) : Promise.resolve([]),
  ]);
  const rulesRaw = configObject?.rules;
  const rules: RuleValue[] = Array.isArray(rulesRaw)
    ? rulesRaw.filter((row): row is RuleValue => !!row && typeof row === "object" && typeof (row as RuleValue).name === "string" && typeof (row as RuleValue).value === "string")
    : [];
  const gameMap = new Map(campaignGamesForDomain.map((row) => [row.id, row]));
  const renameGame = (id: number) => gameMap.get(id);
  const configRules = rules;

  return (
    <>
      <SceneBackdrop area="campaigns" />
      <h1 className="w-display page-title">{campaign.name}</h1>
      <GameSwitcher current={game.id} />
      <div className="w-rule" />
      <nav className={styles.rowGap} aria-label={t("campaigns.details")}>
        <Link className={styles.link} href="/campaigns">{t("campaigns.title")}</Link>
        <span className="label">{t(campaign.kind === "path_to_glory" ? "campaigns.kind.pathToGlory" : "campaigns.kind.generic")}</span>
      </nav>
      <div className={styles.sections}>
        <section className="w-card card-pad">
          <h2 className="card-title">{t("campaigns.details")}</h2>
          <ActionForm action={updateCampaign} submitKey="campaigns.save" className={styles.form}>
            <input type="hidden" name="campaignId" value={id} />
            <Field label={t("campaigns.name")}><input name="name" required maxLength={120} defaultValue={campaign.name} /></Field>
            <Field label={t("campaigns.ownerLabel")}><input name="ownerLabel" maxLength={120} defaultValue={typeof configObject?.ownerLabel === "string" ? configObject.ownerLabel : ""} /></Field>
            <Field label={t("campaigns.notes")}><textarea name="notes" maxLength={10000} defaultValue={campaign.notes ?? ""} /></Field>
          </ActionForm>
          <ConfirmDelete triggerKey="campaigns.delete" warning={t("campaigns.deleteConfirm", { name: campaign.name })} action={deleteCampaign} fields={<input type="hidden" name="campaignId" value={id} />} successHref="/campaigns" />
        </section>
        <section className="w-card card-pad">
          <h2 className="card-title">{t("campaigns.games")}</h2>
          <ActionForm action={linkGame} submitKey="campaigns.linkGame" className={styles.inline}>
            <input type="hidden" name="campaignId" value={id} />
                {eligible.length === 0 ? <p className={styles.muted}>{t("campaigns.noEligibleGames")}</p> : (
              <Field label={t("campaigns.linkGame")}>
                  <select name="playedGameId" required defaultValue="">
                  <option value="" disabled>{t("history.unknown")}</option>
                  {eligible.map((row) => <option key={row.id} value={row.id}>{row.playedOn} · {row.opponent ?? t("history.unknown")} · {resultText(row.result, t)}</option>)}
                </select>
              </Field>
            )}
          </ActionForm>
          {linked.length === 0 ? <p className={styles.muted}>{t("campaigns.noEligibleGames")}</p> : (
            <ol className={styles.stack}>
              {linked.map(({ link, game: row }) => {
                const snapshot = row ? snapshots.get(row.id) : undefined;
                const sides = object(snapshot?.sides);
                const opponent = object(sides?.opponent);
                return (
                  <li className={styles.record} key={link.id}>
                    {row ? <Link className={styles.link} href={`/history/${row.id}`}>{row.playedOn} · {typeof opponent?.name === "string" ? opponent.name : row.opponent ?? t("history.unknown")} · {resultText(outcome(row.result), t)}</Link> : <span className={styles.muted}>{t("history.unknown")}</span>}
                    {row && <ConfirmDelete triggerKey="campaigns.unlinkGame" warning={t("campaigns.unlinkConfirm")} action={unlinkGame} fields={<><input type="hidden" name="campaignId" value={id} /><input type="hidden" name="linkId" value={link.id} /></>} actionKey="campaigns.unlinkGame" />}
                  </li>
                );
              })}
            </ol>
          )}
          {linkedIds.length > 0 && (
            <>
              <h3 className="label">{t("campaigns.ladder")}</h3>
              <p className={styles.small}>{t("campaigns.ladderMethod")}</p>
              {ladder.length > 0 && <ul className={styles.stack}>{ladder.map((row) => <li className={styles.ruleRow} key={row.name}><span>{row.name}</span><span className="num">{t("campaigns.ladderRecord", { wins: formatNumber(locale, row.wins), draws: formatNumber(locale, row.draws), losses: formatNumber(locale, row.losses) })} · {formatNumber(locale, Math.round(row.winRate * 100))}%</span></li>)}</ul>}
            </>
          )}
        </section>
      </div>

      <section className="w-card card-pad">
        <h2 className="card-title">{t(campaign.kind === "path_to_glory" ? "campaigns.roster" : "campaigns.unitHistory")}</h2>
        <ActionForm action={saveRosterUnit} submitKey="campaigns.addUnit" className={styles.inline}>
          <input type="hidden" name="campaignId" value={id} />
          <Field label={t("campaigns.unitName")}><input name="unitName" required maxLength={160} /></Field>
          <Field label={t("campaigns.faction")}><input name="factionName" maxLength={120} /></Field>
          <Field label={t("campaigns.collectionUnit")}><select name="collectionItemId" defaultValue=""><option value="">{t("history.unknown")}</option>{collection.map((item) => <option key={item.id} value={item.id}>{item.unitName}</option>)}</select></Field>
          <Field label={t("campaigns.stableUnitId")}><input name="catalogueUnitId" maxLength={180} /></Field>
          {campaign.kind === "path_to_glory" && <>
            <Field label={t("campaigns.renown")}><input name="startingRenown" type="number" min="0" step="1" defaultValue="0" /></Field>
            <Field label={t("campaigns.gameDate")}><input name="initialDate" type="date" /></Field>
          </>}
          <Field label={t("campaigns.unitNotes")}><input name="notes" maxLength={4000} /></Field>
        </ActionForm>
        {roster.length === 0 ? <p className={styles.muted}>{t("campaigns.noUnits")}</p> : (
          <div className={styles.sections}>
            {roster.map((unit) => {
              const unitGames = unitHistory(unit.unitName, campaignGamesForDomain, unit.unitId);
              const changes = renownEvents.filter((row) => row.rosterUnitId === unit.id);
              const injuriesForUnit = injuries.filter((row) => row.rosterUnitId === unit.id);
              const renownTotal = changes.reduce((total, row) => total + row.renownDelta, 0);
              return (
                <article className="w-card card-pad" key={unit.id}>
                  <h3 className="card-title">{unit.unitName}</h3>
                  {unit.factionName && <div>{unit.factionName}</div>}
                  <ActionForm action={saveRosterUnit} submitKey="campaigns.saveUnit" className={styles.form}>
                    <input type="hidden" name="campaignId" value={id} />
                    <input type="hidden" name="unitId" value={unit.id} />
                    <Field label={t("campaigns.unitName")}><input name="unitName" defaultValue={unit.unitName} required maxLength={160} /></Field>
                    <Field label={t("campaigns.faction")}><input name="factionName" defaultValue={unit.factionName ?? ""} maxLength={120} /></Field>
                    <Field label={t("campaigns.collectionUnit")}><select name="collectionItemId" defaultValue={unit.collectionItemId ?? ""}><option value="">{t("history.unknown")}</option>{collection.map((item) => <option key={item.id} value={item.id}>{item.unitName}</option>)}</select></Field>
                    <Field label={t("campaigns.stableUnitId")}><input name="catalogueUnitId" defaultValue={unit.unitId ?? ""} maxLength={180} /></Field>
                    <Field label={t("campaigns.unitNotes")}><textarea name="notes" defaultValue={unit.notes ?? ""} maxLength={4000} /></Field>
                  </ActionForm>
                  {campaign.kind === "path_to_glory" && (
                    <div className={styles.stack}>
                      <h4 className="label">{t("campaigns.renown")}: <span className="num">{formatNumber(locale, renownTotal)}</span></h4>
                      <ActionForm action={addRenownEvent} submitKey="campaigns.addRenown" className={styles.form}>
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="unitId" value={unit.id} />
                        <div className={styles.inline}>
                          <Field label={t("campaigns.renownDelta")}><input type="number" name="delta" step="1" required /></Field>
                          <Field label={t("campaigns.gameDate")}><input type="date" name="occurredOn" required /></Field>
                        </div>
                        <Field label={t("campaigns.games")}>
                          <select name="playedGameId" defaultValue=""><option value="">{t("history.unknown")}</option>{linked.filter(({ game: row }) => row).map(({ game: row }) => <option key={row!.id} value={row!.id}>{row!.playedOn} · {row!.opponent ?? t("history.unknown")}</option>)}</select>
                        </Field>
                        <Field label={t("campaigns.unitNotes")}><input name="notes" maxLength={2000} /></Field>
                      </ActionForm>
                      {changes.length > 0 && <ol className={styles.stack}>{changes.map((change) => {
                        const linkedGame = change.playedGameId ? renameGame(change.playedGameId) : undefined;
                        return <li className={styles.record} key={change.id}><span className="num">{change.occurredOn} · {change.renownDelta > 0 ? "+" : ""}{formatNumber(locale, change.renownDelta)}</span>{change.notes && <span>{change.notes}</span>}{linkedGame && <Link className={styles.link} href={`/history/${change.playedGameId}`}>{linkedGame.playedOn} · {linkedGame.opponent ?? t("history.unknown")}</Link>}</li>;
                      })}</ol>}
                      <h4 className="label">{t("campaigns.injuries")}</h4>
                      {injuriesForUnit.map((injury) => (
                        <div className={styles.record} key={injury.id}>
                          <ActionForm action={saveInjury} submitKey="campaigns.saveInjury" className={styles.form}>
                            <input type="hidden" name="campaignId" value={id} /><input type="hidden" name="unitId" value={unit.id} /><input type="hidden" name="injuryId" value={injury.id} />
                            <Field label={t("campaigns.injuryName")}><input name="name" defaultValue={injury.name} required maxLength={160} /></Field>
                            <Field label={t("campaigns.injuryDescription")}><textarea name="description" defaultValue={injury.description ?? ""} maxLength={4000} /></Field>
                            <div className={styles.inline}><Field label={t("campaigns.injuryDate")}><input name="incurredOn" type="date" defaultValue={injury.incurredOn} required /></Field><Field label={t("campaigns.recoveredDate")}><input name="recoveredOn" type="date" defaultValue={injury.recoveredOn ?? ""} /></Field></div>
                            <Field label={t("campaigns.games")}><select name="incurredGameId" defaultValue={injury.incurredGameId ?? ""}><option value="">{t("history.unknown")}</option>{linked.filter(({ game: row }) => row).map(({ game: row }) => <option key={row!.id} value={row!.id}>{row!.playedOn} · {row!.opponent ?? t("history.unknown")}</option>)}</select></Field>
                            <label className={styles.inline}><input name="isPermanent" type="checkbox" defaultChecked={injury.isPermanent} />{t("campaigns.permanent")}</label>
                            <Field label={t("campaigns.injuryNotes")}><textarea name="notes" defaultValue={injury.notes ?? ""} maxLength={2000} /></Field>
                          </ActionForm>
                          <ConfirmDelete triggerKey="campaigns.deleteInjury" warning={t("campaigns.deleteInjuryConfirm", { name: injury.name })} action={deleteInjury} fields={<><input type="hidden" name="campaignId" value={id} /><input type="hidden" name="unitId" value={unit.id} /><input type="hidden" name="injuryId" value={injury.id} /></>} actionKey="campaigns.deleteInjury" />
                        </div>
                      ))}
                      <details className={styles.stack}>
                        <summary className={styles.link}>{t("campaigns.addInjury")}</summary>
                        <ActionForm action={saveInjury} submitKey="campaigns.saveInjury" className={styles.form}>
                          <input type="hidden" name="campaignId" value={id} /><input type="hidden" name="unitId" value={unit.id} />
                          <Field label={t("campaigns.injuryName")}><input name="name" required maxLength={160} /></Field>
                          <Field label={t("campaigns.injuryDescription")}><textarea name="description" maxLength={4000} /></Field>
                          <div className={styles.inline}><Field label={t("campaigns.injuryDate")}><input name="incurredOn" type="date" required /></Field><Field label={t("campaigns.recoveredDate")}><input name="recoveredOn" type="date" /></Field></div>
                          <Field label={t("campaigns.games")}><select name="incurredGameId" defaultValue=""><option value="">{t("history.unknown")}</option>{linked.filter(({ game: row }) => row).map(({ game: row }) => <option key={row!.id} value={row!.id}>{row!.playedOn} · {row!.opponent ?? t("history.unknown")}</option>)}</select></Field>
                          <label className={styles.inline}><input name="isPermanent" type="checkbox" />{t("campaigns.permanent")}</label>
                          <Field label={t("campaigns.injuryNotes")}><textarea name="notes" maxLength={2000} /></Field>
                        </ActionForm>
                      </details>
                    </div>
                  )}
                  <h4 className="label">{t("campaigns.unitHistory")}</h4>
                  {unitGames.length === 0 ? <p className={styles.muted}>{t("campaigns.noEligibleGames")}</p> : (
                    <ol className={styles.stack}>{unitGames.map((history) => <li className={styles.record} key={history.gameId}><Link className={styles.link} href={`/history/${history.gameId}`}>{history.playedOn} · {history.opponent ?? t("history.unknown")} · {resultText(history.result, t)}</Link></li>)}</ol>
                  )}
                  <ConfirmDelete triggerKey="campaigns.deleteUnit" warning={t("campaigns.deleteUnitConfirm", { name: unit.unitName })} action={deleteRosterUnit} fields={<><input type="hidden" name="campaignId" value={id} /><input type="hidden" name="unitId" value={unit.id} /></>} actionKey="campaigns.deleteUnit" />
                </article>
              );
            })}
          </div>
        )}
      </section>

      {campaign.kind === "path_to_glory" && (
        <>
          <section className="w-card card-pad">
            <h2 className="card-title">{t("campaigns.territories")}</h2>
            <ActionForm action={saveTerritory} submitKey="campaigns.addTerritory" className={styles.inline}>
              <input type="hidden" name="campaignId" value={id} />
              <Field label={t("campaigns.territoryName")}><input name="name" required maxLength={160} /></Field>
              <Field label={t("campaigns.territoryOwner")}><input name="ownerName" maxLength={160} /></Field>
              <Field label={t("campaigns.territoryDate")}><input name="acquiredOn" type="date" /></Field>
              <Field label={t("campaigns.territoryDescription")}><input name="description" maxLength={4000} /></Field>
              <Field label={t("campaigns.territoryNotes")}><input name="notes" maxLength={2000} /></Field>
            </ActionForm>
            {territories.length === 0 ? <p className={styles.muted}>{t("campaigns.noTerritories")}</p> : (
              <div className={styles.sections}>
                {territories.map((territory) => (
                  <article className={styles.record} key={territory.id}>
                    <h3 className="card-title">{territory.name}</h3>
                    <ActionForm action={saveTerritory} submitKey="campaigns.saveTerritory" className={styles.form}>
                      <input type="hidden" name="campaignId" value={id} /><input type="hidden" name="territoryId" value={territory.id} />
                      <Field label={t("campaigns.territoryName")}><input name="name" defaultValue={territory.name} required maxLength={160} /></Field>
                      <Field label={t("campaigns.territoryOwner")}><input name="ownerName" defaultValue={territory.ownerName ?? ""} maxLength={160} /></Field>
                      <Field label={t("campaigns.territoryDate")}><input name="acquiredOn" type="date" defaultValue={territory.acquiredOn ?? ""} /></Field>
                      <Field label={t("campaigns.territoryDescription")}><textarea name="description" defaultValue={territory.description ?? ""} maxLength={4000} /></Field>
                      <Field label={t("campaigns.territoryNotes")}><textarea name="notes" defaultValue={territory.notes ?? ""} maxLength={2000} /></Field>
                    </ActionForm>
                    <ConfirmDelete triggerKey="campaigns.deleteTerritory" warning={t("campaigns.deleteTerritoryConfirm", { name: territory.name })} action={deleteTerritory} fields={<><input type="hidden" name="campaignId" value={id} /><input type="hidden" name="territoryId" value={territory.id} /></>} actionKey="campaigns.deleteTerritory" />
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="w-card card-pad">
            <h2 className="card-title">{t("campaigns.rulesConfig")}</h2>
            <p>{t("campaigns.rulesManualOnly")}</p>
            {configRules.length === 0 && <p>{t("campaigns.rulesUnconfigured")}</p>}
            <ActionForm action={saveRuleValue} submitKey="campaigns.addRuleValue" className={styles.inline}>
              <input type="hidden" name="campaignId" value={id} />
              <Field label={t("campaigns.ruleName")}><input name="name" required maxLength={160} /></Field>
              <Field label={t("campaigns.ruleValue")}><input name="value" required maxLength={2000} /></Field>
              <Field label={t("campaigns.ruleSource")}><input name="source" maxLength={500} /></Field>
            </ActionForm>
            {configRules.map((rule, index) => (
              <div className={styles.ruleRow} key={`${rule.name}:${index}`}>
                <ActionForm action={saveRuleValue} submitKey="campaigns.saveRuleValue" className={styles.form}>
                  <input type="hidden" name="campaignId" value={id} /><input type="hidden" name="ruleIndex" value={index} />
                  <Field label={t("campaigns.ruleName")}><input name="name" defaultValue={rule.name} required maxLength={160} /></Field>
                  <Field label={t("campaigns.ruleValue")}><textarea name="value" defaultValue={rule.value} required maxLength={2000} /></Field>
                  <Field label={t("campaigns.ruleSource")}><input name="source" defaultValue={rule.source ?? ""} maxLength={500} /></Field>
                </ActionForm>
                <ConfirmDelete triggerKey="campaigns.removeRuleValue" warning={t("campaigns.deleteRuleConfirm", { name: rule.name })} action={deleteRuleValue} fields={<><input type="hidden" name="campaignId" value={id} /><input type="hidden" name="ruleIndex" value={index} /></>} actionKey="campaigns.removeRuleValue" />
              </div>
            ))}
            <div className={styles.record}>
              <h3 className="card-title">{t("campaigns.importConfig")}</h3>
              <p className={styles.small}>{t("campaigns.importConfigHelp")}</p>
              <pre className={styles.example}><code>{t("campaigns.importConfigExample")}</code></pre>
              <ConfirmAction triggerKey="campaigns.importConfig" confirmText={t("campaigns.importConfigConfirm")} action={importConfig} actionKey="campaigns.importConfigSubmit" fields={<><input type="hidden" name="campaignId" value={id} /><Field label={t("campaigns.importConfig")}><input type="file" name="configFile" accept="application/json,.json" required /></Field></>} />
            </div>
          </section>
        </>
      )}
    </>
  );
}
