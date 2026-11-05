export type CampaignOutcome = "win" | "loss" | "draw";

export type CampaignUnitRef = { id?: string | null; name: string };

export type CampaignGame = {
  id: number;
  playedOn: string;
  opponent: string | null;
  result: CampaignOutcome | null;
  ownerUnits: CampaignUnitRef[];
  opponentUnits: CampaignUnitRef[];
};

export type LadderRow = {
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
};

/** A record ladder for every named participant; game results are recorded from the owner's perspective. */
export function buildLadder(games: CampaignGame[], ownerLabel: string): LadderRow[] {
  const rows = new Map<string, LadderRow>();
  const addResult = (name: string, result: CampaignOutcome) => {
    const row = rows.get(name) ?? { name, played: 0, wins: 0, draws: 0, losses: 0, winRate: 0 };
    row.played++;
    if (result === "win") row.wins++;
    else if (result === "draw") row.draws++;
    else row.losses++;
    rows.set(name, row);
  };
  for (const game of games) {
    if (!game.result) continue;
    const opponentResult = game.result === "win" ? "loss" : game.result === "loss" ? "win" : "draw";
    addResult(ownerLabel, game.result);
    addResult(game.opponent?.trim() || "Unknown opponent", opponentResult);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, winRate: row.wins / row.played }))
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.name.localeCompare(b.name));
}

export type UnitGameHistory = { gameId: number; playedOn: string; opponent: string | null; result: CampaignOutcome | null; side: "owner" | "opponent" };

/** Match a campaign's manually named unit against the frozen names captured in linked game start events. */
export function unitHistory(unitName: string, games: CampaignGame[], stableUnitId?: string | null): UnitGameHistory[] {
  const key = normalize(unitName);
  const matchesUnit = (unit: CampaignUnitRef) => stableUnitId ? unit.id === stableUnitId : normalize(unit.name) === key;
  return games
    .filter((game) => game.ownerUnits.some(matchesUnit) || game.opponentUnits.some(matchesUnit))
    .map((game) => ({
      gameId: game.id,
      playedOn: game.playedOn,
      opponent: game.opponent,
      result: game.result,
      side: game.ownerUnits.some(matchesUnit) ? "owner" : "opponent",
    }));
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}
