export type ReviewedRecord = { entityKind: string; sourceId: string; matchTargetId: string | null; proposed: Record<string, unknown> };
export type PrivateAssetDraft = Record<string, unknown> & { id?: unknown; kind?: unknown };
export function canReviewPublishedCandidate(status: string, entityKind: string) {
  return status === "review" || (status === "accepted" && entityKind === "image");
}

export type TransactionHost<Tx> = { transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };
export type LockedImportRun = { id: number; status: string };

/** The shared publication gate: lock the run, publish its accepted snapshot, then mark it accepted atomically. */
export async function publishRunOnce<Tx, Run extends LockedImportRun, Result>(
  database: TransactionHost<Tx>,
  runId: number,
  operations: {
    lockRun(tx: Tx, id: number): Promise<Run | undefined>;
    publish(tx: Tx, run: Run): Promise<Result>;
    markAccepted(tx: Tx, id: number): Promise<void>;
  },
): Promise<Result> {
  return database.transaction(async (tx) => {
    const run = await operations.lockRun(tx, runId);
    if (!run || run.status !== "review") throw new Error("invalid-run");
    const result = await operations.publish(tx, run);
    await operations.markAccepted(tx, runId);
    return result;
  });
}

/** A publication revision hashes the effective pack data, including owner overrides, but excludes its old revision. */
export function effectiveCatalogueRevision(pack: Record<string, unknown>, hash: (source: string) => string) {
  const effectivePack = Object.fromEntries(Object.entries(pack).filter(([key]) => key !== "revision"));
  return hash(canonicalJson(effectivePack));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function isValidPointsValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

const defaultSections: Record<string, string> = {
  faction: "factions", unit: "units", ability: "abilities", card: "cards", mode: "modes", scenario: "scenarios",
  enhancement: "enhancements", regiment: "regiments", crisis: "crises", affiliation: "affiliations",
  "team-tactic": "teamTactics", upgrade: "upgrades", stance: "stances", objective: "objectives",
  "order-card": "orderCards", "command-card": "commandCards", "battle-force": "battleForces",
  equipment: "equipment", "objective-card": "objectiveCards", "starter-box": "starterBoxes",
};

export function composeReviewedCatalogue(candidates: readonly ReviewedRecord[]) {
  const catalogue: Record<string, Record<string, unknown>[]> = Object.fromEntries([...new Set(Object.values(defaultSections))].map((section) => [section, []]));
  const points: ReviewedRecord[] = [];
  const acceptedAssetIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.entityKind === "points") { points.push(candidate); continue; }
    if (candidate.entityKind === "asset" || candidate.entityKind === "token") {
      acceptedAssetIds.add(candidate.sourceId);
      continue;
    }
    const section = defaultSections[candidate.entityKind];
    if (!section) continue;
    catalogue[section]!.push(structuredClone(candidate.proposed));
    if (["card", "token"].includes(candidate.entityKind) && Array.isArray(candidate.proposed.assetIds)) {
      for (const id of candidate.proposed.assetIds) if (typeof id === "string") acceptedAssetIds.add(id);
    }
    if (candidate.entityKind === "asset") acceptedAssetIds.add(candidate.sourceId);
  }
  for (const candidate of points) {
    if (!candidate.matchTargetId) throw new Error("points-unmatched");
    const unit = catalogue.units!.find((record) => record.id === candidate.matchTargetId);
    if (!unit) throw new Error("points-unmatched");
    unit.points = candidate.proposed.points;
    unit.pointsProfileSize = candidate.proposed.unitSize;
    unit.pointsSource = { sourceUrl: candidate.proposed.sourceUrl, page: candidate.proposed.page, sourceDate: candidate.proposed.sourceDate, verifiedMinSize: false };
    unit.reviewFlags = [...new Set([...(Array.isArray(unit.reviewFlags) ? unit.reviewFlags.filter((flag): flag is string => typeof flag === "string") : []), "battle-profiles-row-reviewed-by-owner"])];
  }
  for (const section of Object.values(catalogue)) for (const record of section) {
    if (Array.isArray(record.assetIds)) record.assetIds = record.assetIds.filter((id) => typeof id === "string" && acceptedAssetIds.has(id));
  }
  return { catalogue, acceptedAssetIds };
}

export function selectReviewedAssets(assets: readonly PrivateAssetDraft[], acceptedAssetIds: ReadonlySet<string>) {
  return assets.filter((asset) => !["card", "token"].includes(String(asset.kind)) || acceptedAssetIds.has(String(asset.id)));
}
