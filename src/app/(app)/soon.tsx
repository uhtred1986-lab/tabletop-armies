import type { StringKey } from "@/i18n";
import { getT } from "@/i18n/server";
import { currentGame } from "@/lib/current-game";
import { GameSwitcher } from "@/components/GameSwitcher";
import { PhaseRail } from "@/components/PhaseRail";

/** Placeholder for a section that arrives with a later milestone, in the current game's world. */
export async function SoonPage({ messageKey }: { messageKey: StringKey }) {
  const t = await getT();
  const game = await currentGame();
  return (
    <>
      <GameSwitcher current={game.id} />
      <div className="w-card card-pad">{t(messageKey)}</div>
      <PhaseRail phases={game.phases.map((p) => ({ id: p.id, label: t(p.labelKey as StringKey) }))} current={game.phases[0]?.id ?? ""} />
    </>
  );
}
