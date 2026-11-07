// What the crisis world home (comic page) shows of the latest list: pure, no database or React (CLAUDE.md rule 2).
// Every number here comes from the saved list or the pack; a missing value stays undefined, never a guess.

type Data = Record<string, unknown>;
const data = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? v as Data : {});
const rows = (v: unknown): Data[] => (Array.isArray(v) ? v.map(data) : []);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

export interface ComicCharacter {
  id: string;
  /** The pack's name, or the saved id when the pack does not hold the character. */
  name: string;
  known: boolean;
  threat?: number;
  stamina?: number;
  /** Affiliation names from the pack, in pack order. */
  affiliations: string[];
}

export interface ComicCrisis {
  id: string;
  name: string;
  /** Secure or Extract, from the roster slot or the pack. */
  type?: "secure" | "extract";
  threat?: number;
}

export interface ComicCard { id: string; name: string }

export interface ComicSquad {
  kind: "squad" | "roster";
  /** Squads only: the threat limit the owner set. */
  threatLimit?: number;
  /** Squads only: the characters' threat added up, when the pack gives every one of them a threat. */
  threatUsed?: number;
  affiliation?: string;
  characters: ComicCharacter[];
  crises: ComicCrisis[];
  tactics: ComicCard[];
}

interface ListLike { packId: number | null; definition: Record<string, unknown> }
interface PackLike { id: number; content: unknown }

/**
 * Reads a saved Crisis Protocol list (roster or squad) with the pack it was built from. Names come from the pack
 * only when the list's pack is the one given; otherwise the saved ids are shown as they are.
 */
export function comicSquad(list: ListLike, pack?: PackLike): ComicSquad | undefined {
  const selections = data(list.definition.selections);
  const threatLimit = num(selections.threatLimit);
  const kind: ComicSquad["kind"] | undefined = threatLimit !== undefined ? "squad"
    : Array.isArray(selections.characterIds) || Array.isArray(selections.secureCrisisIds) ? "roster" : undefined;
  if (!kind) return undefined;

  const catalogue = pack && pack.id === list.packId ? data(data(pack.content).catalogue) : {};
  const byId = (section: unknown) => new Map(rows(section).map((row) => [String(row.id), row]));
  const units = byId(catalogue.units);
  const affiliations = byId(catalogue.affiliations);
  const crisisRows = byId(catalogue.crises);
  const tacticRows = new Map([...byId(catalogue.cards), ...byId(catalogue.teamTactics)]);
  const nameOf = (row: Data | undefined, id: string) => text(row?.name) ?? id;

  const characters: ComicCharacter[] = ids(selections.characterIds).map((id) => {
    const unit = units.get(id);
    const stamina = data(unit?.stamina);
    return {
      id,
      name: nameOf(unit, id),
      known: Boolean(unit),
      threat: num(unit?.threat),
      stamina: num(stamina.healthy),
      affiliations: ids(unit?.affiliations).map((a) => nameOf(affiliations.get(a), a)),
    };
  });

  const crisis = (id: string, slot?: "secure" | "extract"): ComicCrisis => {
    const row = crisisRows.get(id);
    const packType = row?.type === "secure" || row?.type === "extract" ? row.type : undefined;
    return { id, name: nameOf(row, id), type: slot ?? packType, threat: num(row?.threat) };
  };
  const crises = kind === "squad"
    ? ids(selections.crisisIds).map((id) => crisis(id))
    : [...ids(selections.secureCrisisIds).map((id) => crisis(id, "secure")), ...ids(selections.extractCrisisIds).map((id) => crisis(id, "extract"))];

  const tactics = ids(selections.teamTacticIds).map((id) => ({ id, name: nameOf(tacticRows.get(id), id) }));

  const threats = characters.map((c) => c.threat);
  const threatUsed = kind === "squad" && characters.length > 0 && threats.every((t) => t !== undefined)
    ? threats.reduce<number>((sum, t) => sum + (t ?? 0), 0)
    : undefined;
  const affiliationId = text(selections.affiliationId);

  return {
    kind,
    threatLimit,
    threatUsed,
    affiliation: affiliationId ? nameOf(affiliations.get(affiliationId), affiliationId) : undefined,
    characters,
    crises,
    tactics,
  };
}
