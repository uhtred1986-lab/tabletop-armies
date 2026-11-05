export type PositionedPdfText = { text: string; x: number; y: number; width: number; height: number };
export type McpCropBounds = { x: number; y: number; width: number; height: number };
export type McpPageBounds = { width: number; height: number };
export type McpProfileSide = "healthy" | "injured";
export type McpProfileLayout = "standard-stat-card" | "grunt" | "horsemen" | "unknown";

export type McpStatProfile = {
  side: McpProfileSide | null;
  threat?: number;
  stamina?: number;
  stats: {
    size?: number;
    movement?: "S" | "M" | "L";
    defenses?: { physical?: number; energy?: number; mystic?: number };
  };
  numericMarkers: Array<{ value: number; x: number; y: number }>;
  profileCompleteness: "complete" | "unverified";
  reviewFlags: string[];
};

type NumericField = "physical" | "energy" | "mystic" | "stamina" | "size" | "threat";
type Region = { xMin: number; xMax: number; yMin: number; yMax: number };
type LocatedText = { text: string; x: number; y: number };

// Normalized to the standard stat-card crop. They match the stat panel's fixed
// three-row grid; attack and superpower values to the right are never candidates.
const regions: Record<NumericField, Region> = {
  physical: { xMin: 0.045, xMax: 0.095, yMin: 0.14, yMax: 0.20 },
  energy: { xMin: 0.12, xMax: 0.17, yMin: 0.14, yMax: 0.20 },
  mystic: { xMin: 0.195, xMax: 0.245, yMin: 0.14, yMax: 0.20 },
  stamina: { xMin: 0.075, xMax: 0.13, yMin: 0.20, yMax: 0.26 },
  threat: { xMin: 0.16, xMax: 0.215, yMin: 0.20, yMax: 0.26 },
  size: { xMin: 0.073, xMax: 0.13, yMin: 0.27, yMax: 0.34 },
};
const movementRegion: Region = { xMin: 0.16, xMax: 0.22, yMin: 0.27, yMax: 0.34 };
const NUMERIC_FIELDS: NumericField[] = ["physical", "energy", "mystic", "stamina", "size", "threat"];

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0 && value <= 99;
}

function inRegion(item: LocatedText, region: Region): boolean {
  return item.x >= region.xMin && item.x <= region.xMax && item.y >= region.yMin && item.y <= region.yMax;
}

/**
 * Extract a single healthy or injured side from the standard MCP stat-card layout.
 * The helper intentionally refuses grunt, horsemen, unknown or malformed layouts;
 * their panels need separate verified templates before any values can be assigned.
 */
export function extractMcpStatProfile(input: {
  items: PositionedPdfText[];
  crop: McpCropBounds;
  page: McpPageBounds;
  layout: McpProfileLayout;
  side: McpProfileSide | string;
}): McpStatProfile {
  const result: McpStatProfile = {
    side: input.side === "healthy" || input.side === "injured" ? input.side : null,
    stats: {},
    numericMarkers: [],
    profileCompleteness: "unverified",
    reviewFlags: [],
  };

  const { crop, page } = input;
  const cropIsValid = [crop.x, crop.y, crop.width, crop.height, page.width, page.height].every(Number.isFinite)
    && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0
    && page.width > 0 && page.height > 0
    && crop.x + crop.width <= page.width && crop.y + crop.height <= page.height;
  if (input.layout !== "standard-stat-card" || !cropIsValid || result.side === null) {
    result.reviewFlags.push("mcp-profile-layout-unverified");
    return result;
  }

  const textItems: LocatedText[] = input.items.flatMap((item) => {
    const x = (item.x - crop.x) / crop.width;
    const y = (item.y - crop.y) / crop.height;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return [];
    return [{ text: item.text.trim(), x, y }];
  });
  const markerItems = textItems.flatMap((item) => {
    const match = item.text.match(/^\d{1,2}$/);
    if (!match) return [];
    return [{ value: Number(match[0]), x: round3(item.x), y: round3(item.y) }];
  });
  result.numericMarkers = markerItems;

  const found: Partial<Record<NumericField, number>> = {};
  let ambiguous = false;
  let incomplete = false;
  for (const field of NUMERIC_FIELDS) {
    const region = regions[field];
    const matches = textItems.filter((item) => inRegion(item, region) && /^\d{1,2}$/.test(item.text));
    if (matches.length !== 1) {
      incomplete = true;
      if (matches.length > 1) ambiguous = true;
      continue;
    }
    const value = Number(matches[0]!.text);
    if (!isFinitePositive(value)) {
      incomplete = true;
      continue;
    }
    found[field] = value;
  }

  const movements = textItems.filter((item) => inRegion(item, movementRegion) && /^[SML]$/i.test(item.text));
  if (movements.length !== 1) {
    incomplete = true;
    if (movements.length > 1) ambiguous = true;
  }

  if (incomplete || ambiguous) {
    result.reviewFlags.push("mcp-stat-panel-incomplete", "mcp-profile-layout-unverified");
    if (ambiguous) result.reviewFlags.push("mcp-stat-panel-ambiguous");
    return result;
  }

  result.threat = found.threat;
  result.stamina = found.stamina;
  result.stats.size = found.size;
  result.stats.movement = movements[0]!.text.toUpperCase() as "S" | "M" | "L";
  result.stats.defenses = {
    physical: found.physical,
    energy: found.energy,
    mystic: found.mystic,
  };
  result.profileCompleteness = "complete";
  return result;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
