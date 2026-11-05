import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOwnerPage } from "@/lib/auth";
import { getLocale } from "@/i18n/server";
import { currentGame } from "@/lib/current-game";
import { getVariants, variantForDefinition } from "@/lib/lists/modules";
import { featureTranslator } from "@/i18n/features/play";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { PlayWorkspace } from "@/components/PlayWorkspace";
import type { PlayEvent, PlayModuleSnapshot } from "@/lib/play/replay";
import type { CataloguePack } from "@/games/types";
import { readOwnerCollectionSnapshot } from "@/lib/lists/collection-snapshot";

export const dynamic = "force-dynamic";

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const owner = await requireOwnerPage();
  const [game, locale, query] = await Promise.all([currentGame(), getLocale(), searchParams]);
  const t = featureTranslator(locale);
  const [listRows, packs, played, collection] = await Promise.all([
    db.select().from(schema.armyLists).where(eq(schema.armyLists.gameId, game.id)).orderBy(asc(schema.armyLists.name)),
    db.select().from(schema.dataPacks).where(eq(schema.dataPacks.gameId, game.id)).orderBy(desc(schema.dataPacks.importedAt)),
    db.select().from(schema.playedGames).where(eq(schema.playedGames.gameId, game.id)).orderBy(desc(schema.playedGames.playedOn), desc(schema.playedGames.id)),
    readOwnerCollectionSnapshot(game.id),
  ]);
  const playModule = {
    id: game.id,
    world: game.world,
    name: t(game.nameKey),
    rounds: game.rounds,
    phases: game.phases.map((phase) => ({ id: phase.id, label: t(phase.labelKey) })),
    trackers: (game.trackers ?? []).map((tracker) => ({ ...tracker, label: t(tracker.labelKey), options: tracker.options?.map((option) => ({ ...option, label: t(option.labelKey) })) })),
    tools: game.playTools ?? {},
    orderOptions: availableOptions(packs[0]?.content, "orderCards").map((option) => ({ id: option.id, label: option.name })),
    labels: {
      round: t("play.round"), phase: t("play.phase"), owner: t("play.ownerSide"), opponent: t("play.opponentSide"),
      nextPhase: t("play.nextPhase"), nextRound: t("play.nextRound"), changeSide: t("play.changeSide"), undo: t("play.undo"),
      activeSide: t("play.activeSide"), trackers: t("play.trackers"), orderDeck: t("play.orderDeck"), struggle: t("play.struggle"),
      timer: t("play.timer"), value: t("play.value"), add: t("play.add"), remove: t("play.remove"), game: t("play.title"),
      actions: t("play.actions"), sync: t("play.syncNow"), noGames: t("play.noGames"), reconnect: t("play.reconnect"), record: t("play.record"),
    },
  } satisfies PlayModuleSnapshot;
  const variants = getVariants(game);
  const packByRowId = new Map(packs.map((pack) => [pack.id, pack]));
  const lists = listRows.map((row) => {
    const definition = row.entries as Record<string, unknown>;
    const variant = variantForDefinition(game, definition);
    const pack = row.packId === null ? undefined : packByRowId.get(row.packId);
    const settings = definition?.settings && typeof definition.settings === "object" ? definition.settings as Record<string, unknown> : {};
    const validation = variant?.validateList(definition, pack?.content ?? {}, { collection, constraints: settings }) ?? { issues: [], status: "incomplete" as const };
    return { id: row.id, name: row.name, definition, validation, variantId: variant?.id ?? "", packId: row.packId };
  });
  const selectedId = query.id && /^\d+$/.test(query.id) ? Number(query.id) : played.find((item) => item.result === null)?.id;
  const selectedGame = played.find((item) => item.id === selectedId);
  const events = selectedGame
    ? await db.select({ seq: schema.gameEvents.seq, kind: schema.gameEvents.kind, payload: schema.gameEvents.payload }).from(schema.gameEvents)
      .where(eq(schema.gameEvents.playedGameId, selectedGame.id)).orderBy(asc(schema.gameEvents.seq))
    : [];
  return (
    <>
      <SceneBackdrop area="play" />
      <PlayWorkspace owner={owner.email} locale={locale} game={playModule} lists={lists} listVariants={variants.map((variant) => ({ id: variant.id, labelKey: variant.labelKey }))}
        packs={packs.map((pack) => ({ id: pack.id, content: pack.content as CataloguePack, sourceDate: pack.sourceDate, revision: String((pack.content as Record<string, unknown>)?.revision ?? "") }))}
        currentPack={packs[0] ? { id: packs[0].id, content: packs[0].content as CataloguePack, sourceDate: packs[0].sourceDate, revision: String((packs[0].content as Record<string, unknown>)?.revision ?? "") } : undefined}
        history={played.map((row) => ({ id: row.id, opponent: row.opponent ?? "", playedOn: row.playedOn, result: row.result, listIds: row.listIds }))}
        selectedGame={selectedGame ? { id: selectedGame.id, opponent: selectedGame.opponent ?? "", playedOn: selectedGame.playedOn, result: selectedGame.result, listIds: selectedGame.listIds } : undefined}
        initialEvents={events.map((event) => ({ ...event, payload: event.payload as Record<string, unknown> })) as PlayEvent[]}
        opponents={availableOptions(packs[0]?.content, "units")} />
    </>
  );
}

function availableOptions(pack: unknown, source: string): { id: string; name: string }[] {
  if (!pack || typeof pack !== "object") return [];
  const catalogue = (pack as Record<string, unknown>).catalogue;
  if (!catalogue || typeof catalogue !== "object") return [];
  const list = (catalogue as Record<string, unknown>)[source];
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    return typeof row.id === "string" && typeof row.name === "string" ? [{ id: row.id, name: row.name }] : [];
  });
}
