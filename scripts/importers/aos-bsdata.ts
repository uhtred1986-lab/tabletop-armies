import { XMLParser } from "fast-xml-parser";
import { stableId } from "./matching";

type Node = Record<string, unknown>;
type XmlRecord = { entityKind: string; sourceId: string; proposed: Record<string, unknown> };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (_name, jPath) => typeof jPath === "string" && /(?:selectionEntries|selectionEntryGroups|entryLinks|selectionEntryLinks|profiles|profileTypes|rules|categoryLinks|costs|constraints|characteristics|characteristicTypes|categoryEntries|sharedSelectionEntries|sharedProfiles|sharedRules)$/.test(jPath),
});

/** Parse local BSData files without modifying or publishing them. Feed every sibling .cat plus its shared .gst. */
export function parseAosBsdata(input: { gameSystemXml: string; catalogueFiles: Array<{ fileName: string; xml: string }> }) {
  const gameSystem = rootNode(parser.parse(input.gameSystemXml), "gameSystem");
  const catalogues = input.catalogueFiles.map(({ fileName, xml }) => ({ fileName, node: rootNode(parser.parse(xml), "catalogue") }));
  const shared = indexShared(gameSystem, catalogues.map(({ node }) => node));
  const packRevision = input.catalogueFiles.map(({ fileName, xml }) => `${fileName}:${shortHash(xml)}`).sort().join("|");
  const provenance: Array<Record<string, unknown>> = [{
    kind: "owner-import",
    sourceName: "BSData age-of-sigmar-4th (local files)",
    note: "Community maintained source; local import only. Verify current values against official Battle Profiles.",
  }];
  const factions: Node[] = [];
  const unitsById = new Map<string, Node>();
  const abilitiesById = new Map<string, Node>();
  const enhancementsById = new Map<string, Node>();
  const modes: Node[] = [];
  const scenarios: Node[] = [];
  const candidates: XmlRecord[] = [];
  const diagnostics: string[] = [];
  const factionByName = new Map<string, string>();
  for (const { fileName, node } of catalogues) {
    const catalogueName = stringAttr(node, "name") || fileName.replace(/\.cat$/i, "");
    if (/\s-\sLibrary$/i.test(catalogueName) || /\s-\s/i.test(catalogueName)) continue;
    const factionName = factionNameFor(catalogueName, fileName);
    const key = normalizeName(factionName);
    if (factionByName.has(key)) continue;
    const faction = { id: stableId("faction", factionName), name: factionName, sourceId: stringAttr(node, "id") || fileName, provenance: [0] };
    factionByName.set(key, String(faction.id));
    factions.push(faction);
    candidates.push({ entityKind: "faction", sourceId: faction.sourceId as string, proposed: faction });
  }

  for (const { fileName, node } of catalogues) {
    const catalogueName = stringAttr(node, "name") || fileName.replace(/\.cat$/i, "");
    const factionName = factionNameFor(catalogueName, fileName);
    if (!/\s-\sLibrary$/i.test(catalogueName) && !factionByName.has(normalizeName(factionName))) {
      const factionId = stableId("faction", factionName);
      const faction = { id: factionId, name: factionName, sourceId: stringAttr(node, "id") || fileName, provenance: [0] };
      factionByName.set(normalizeName(factionName), factionId);
      factions.push(faction);
      candidates.push({ entityKind: "faction", sourceId: faction.sourceId as string, proposed: faction });
    }
    const factionId = factionByName.get(normalizeName(factionName)) ?? stableId("faction", factionName);

    for (const entry of [...nodes(node.entryLinks), ...nodes(node.selectionEntryLinks), ...nodes(node.selectionEntries)]) {
      const entryType = stringAttr(entry, "type");
      const reachable = resolveEntryGraph(entry, shared);
      const profileNodes = reachable.flatMap((n) => nodes(n.profiles));
      const unitProfiles = profileNodes.filter((profile) => isUnitProfile(profile, gameSystem));
      const statProfiles = unitProfiles.map(profileToStats).filter((profile) => Object.keys(profile.stats).length > 0);
      const categories = unique(reachable.flatMap((n) => nodes(n.categoryLinks).map((category) => stringAttr(category, "name"))).filter(Boolean));
      const sourceId = stringAttr(entry, "targetId") || stringAttr(entry, "id") || `${fileName}:${stringAttr(entry, "name")}`;
      const name = stringAttr(entry, "name") || reachable.map((n) => stringAttr(n, "name")).find(Boolean) || "";
      if (entryType === "upgrade" && !statProfiles.length) {
        const record = { id: stableId("enhancement", sourceId), name: name || "Unnamed selection", sourceId, provenance: [0], factionId, categoryIds: categories, selectionType: entryType };
        if (/battle formation|enhancement/i.test(`${name} ${categories.join(" ")}`)) {
          enhancementsById.set(String(record.id), record);
        } else if (/spell|prayer|manifestation|lore|ability/i.test(`${name} ${categories.join(" ")}`) || reachable.some((n) => nodes(n.rules).length)) {
          const ability = { ...record, id: stableId("ability", sourceId), kind: inferAbilityKind(name, categories) };
          abilitiesById.set(String(ability.id), ability);
        }
        continue;
      }
      const hasResolvedUnitType = reachable.some((record) => ["unit", "model"].includes(stringAttr(record, "type")));
      if (!isUnitEntry(entryType) && !statProfiles.length) continue;
      if (!statProfiles.length && !hasResolvedUnitType) continue;
      if (entryType === "upgrade" && !statProfiles.length) continue;
      if (!name) {
        diagnostics.push(`${fileName}: entry ${sourceId} has no name`);
        continue;
      }
      const costs = reachable.flatMap(numberCosts);
      const abilityIds = reachable.flatMap((n) => nodes(n.rules).map((rule) => {
        const ruleName = stringAttr(rule, "name");
        if (!ruleName) return undefined;
        const abilitySourceId = stringAttr(rule, "id") || `${sourceId}:${ruleName}`;
        const id = stableId("ability", abilitySourceId);
        const text = stringValue(rule);
        abilitiesById.set(id, { id, name: ruleName, text, factionId, unitId: stableId("unit", sourceId), sourceId: abilitySourceId, provenance: [0] });
        return id;
      }).filter((id): id is string => Boolean(id)));
      const role = inferRole(entryType, categories, statProfiles);
      const points = costs.find((cost) => /^(?:pts?|points?)$/i.test(cost.name.trim()))?.value;
      const reviewFlags = [
        ...(statProfiles.length > 1 ? ["multiple-unit-profiles"] : !statProfiles.length ? ["no-unit-profile"] : []),
        ...(points === undefined ? ["missing-points"] : []),
      ];
      const candidate = {
        id: stableId("unit", sourceId),
        name,
        sourceId,
        provenance: [0],
        factionId,
        role,
        stats: statProfiles.length === 1 ? statProfiles[0]!.stats : undefined,
        profiles: statProfiles,
        points,
        costCompleteness: points === undefined ? "missing-points" : "parsed",
        costs: costs.length ? costs : undefined,
        keywords: categories,
        abilityIds: unique(abilityIds),
        profileCompleteness: statProfiles.length ? "parsed" : "missing-profile",
        reviewFlags,
      };
      if (!statProfiles.length) diagnostics.push(`${fileName}: ${name} has no linked unit profile`);
      if (points === undefined) diagnostics.push(`${fileName}: ${name} has no point cost in the source files`);
      if (!unitsById.has(String(candidate.id))) {
        unitsById.set(String(candidate.id), candidate);
        candidates.push({ entityKind: "unit", sourceId, proposed: candidate });
      }
    }

    for (const entry of nodes(node.selectionEntries)) {
      if (stringAttr(entry, "type") !== "upgrade") continue;
      const categoryIds = nodes(entry.categoryLinks).map((category) => stringAttr(category, "name")).filter(Boolean);
      const name = stringAttr(entry, "name");
      const sourceId = stringAttr(entry, "id") || `${fileName}:${name}`;
      if (/battle formation|enhancement/i.test(`${name} ${categoryIds.join(" ")}`)) {
        const enhancement = { id: stableId("enhancement", sourceId), name, sourceId, provenance: [0], factionId, categoryIds };
        enhancementsById.set(String(enhancement.id), enhancement);
      } else if (/spell|prayer|manifestation|lore|ability/i.test(`${name} ${categoryIds.join(" ")}`)) {
        const ability = { id: stableId("ability", sourceId), name, sourceId, provenance: [0], factionId, categoryIds, kind: inferAbilityKind(name, categoryIds) };
        abilitiesById.set(String(ability.id), ability);
      }
    }

    const categoryNames = unique(catalogueCategories(node).filter(Boolean));
    for (const category of categoryNames) {
      if (/spearhead/i.test(category)) modes.push({ id: stableId("mode", `spearhead:${category}`), name: category, sourceId: `${fileName}:category:${category}` });
      if (/path to glory/i.test(category)) modes.push({ id: stableId("mode", `path-to-glory:${category}`), name: category, sourceId: `${fileName}:category:${category}` });
    }
  }

  const constraints = {
    unconfigured: [
      { id: "matched-play", reason: "Current Battle Profiles must be checked against the official source by the owner." },
      ...(!modes.some(({ name }) => /spearhead/i.test(String(name))) ? [{ id: "spearhead", reason: "No mode data was present in these local BSData files." }] : []),
      ...(!modes.some(({ name }) => /path to glory/i.test(String(name))) ? [{ id: "path-to-glory", reason: "BSData availability varies; enter any missing campaign rules manually." }] : []),
    ],
    parserDiagnostics: diagnostics,
    importedFrom: "local BSData XML files",
  };
  return {
    pack: {
      schemaVersion: 1,
      gameId: "aos" as const,
      packId: `aos-${shortHash(packRevision)}`,
      revision: packRevision,
      importedAt: new Date().toISOString(),
      provenance,
      assets: [],
      catalogue: { factions, units: [...unitsById.values()], abilities: [...abilitiesById.values()], cards: [], modes, scenarios, enhancements: [...enhancementsById.values()], regiments: [] },
      constraints,
    },
    candidates,
    diagnostics,
  };
}

function rootNode(parsed: unknown, tag: string): Node {
  if (!parsed || typeof parsed !== "object") throw new Error(`Invalid XML: missing ${tag}`);
  const value = (parsed as Node)[tag];
  if (!value || typeof value !== "object") throw new Error(`Invalid XML: missing ${tag}`);
  return value as Node;
}

function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap((item) => nodes(item));
  if (!value || typeof value !== "object") return [];
  const node = value as Node;
  const wrappers = [
    "selectionEntry", "selectionEntryGroup", "entryLink", "selectionEntryLink", "profile", "profileType", "rule",
    "categoryLink", "categoryEntry", "cost", "constraint", "characteristic", "characteristicType",
    "sharedSelectionEntry", "sharedProfile", "sharedRule",
  ];
  const wrapper = wrappers.find((key) => key in node);
  if (wrapper && Object.keys(node).every((key) => key === wrapper)) return nodes(node[wrapper]);
  return [node];
}

function stringAttr(node: Node, key: string): string {
  const value = node[`@_${key}`];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function stringValue(node: Node): string {
  const value = node.description ?? node.text ?? node["#text"];
  return typeof value === "string" ? value : "";
}

function factionNameFor(catalogueName: string, fileName: string): string {
  const fromFile = fileName.replace(/\.cat$/i, "");
  const name = (catalogueName || fromFile).split(/\s-\s/)[0] || fromFile;
  return name.replace(/\s*\[LEGENDS\]$/i, "").trim();
}

function normalizeName(value: string): string { return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " "); }

function inferAbilityKind(name: string, categories: string[]): string {
  const value = `${name} ${categories.join(" ")}`.toLowerCase();
  if (/manifestation/.test(value)) return "manifestation-lore";
  if (/prayer/.test(value)) return "prayer-lore";
  if (/spell/.test(value)) return "spell-lore";
  if (/battle formation/.test(value)) return "battle-formation";
  return "ability";
}

function indexShared(gameSystem: Node, catalogueNodes: Node[]) {
  const indexed = new Map<string, Node>();
  const roots = [gameSystem, ...catalogueNodes];
  const walk = (value: unknown) => {
    for (const item of nodes(value)) {
      const id = stringAttr(item, "id");
      if (id && (item.selectionEntries || item.profiles || item.rules || item.constraints || item.costs)) indexed.set(id, item);
      for (const [key, child] of Object.entries(item)) if (!key.startsWith("@_")) walk(child);
    }
  };
  roots.forEach(walk);
  return indexed;
}

function resolveEntryGraph(root: Node, index: Map<string, Node>): Node[] {
  const result: Node[] = [];
  const seen = new Set<Node>();
  const visit = (entry: Node) => {
    if (seen.has(entry)) return;
    seen.add(entry);
    result.push(entry);
    const selfTargetId = stringAttr(entry, "targetId");
    const selfTarget = selfTargetId ? index.get(selfTargetId) : undefined;
    if (selfTarget) visit(selfTarget);
    for (const key of ["selectionEntries", "selectionEntryGroups"]) for (const nested of nodes(entry[key])) visit(nested);
    for (const key of ["entryLinks", "selectionEntryLinks"]) {
      for (const link of nodes(entry[key])) {
        const targetId = stringAttr(link, "targetId");
        const target = targetId ? index.get(targetId) : undefined;
        if (target) visit(target);
      }
    }
  };
  visit(root);
  return result;
}

function numberCosts(entry: Node): Array<{ name: string; value: number; sourceId?: string }> {
  return nodes(entry.costs).flatMap((cost) => {
    const value = Number(stringAttr(cost, "value"));
    if (!Number.isFinite(value)) return [];
    return [{ name: stringAttr(cost, "name"), value, sourceId: stringAttr(cost, "id") || undefined }];
  });
}

function profileToStats(profile: Node) {
  const characteristics = nodes(profile.characteristics).map((characteristic) => ({
    name: stringAttr(characteristic, "name"),
    value: stringAttr(characteristic, "value") || stringValue(characteristic),
  })).filter(({ name, value }) => name && value);
  return {
    id: stableId("profile", stringAttr(profile, "id") || stringAttr(profile, "name")),
    name: stringAttr(profile, "name"),
    profileType: stringAttr(profile, "typeId"),
    stats: Object.fromEntries(characteristics.map(({ name, value }) => [name, parseNumericStat(value)])),
    sourceId: stringAttr(profile, "id"),
  };
}

function parseNumericStat(value: string): number | string {
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
}

function isUnitProfile(profile: Node, gameSystem: Node): boolean {
  const typeId = stringAttr(profile, "typeId");
  const byId = nodes(gameSystem.profileTypes).find((type) => stringAttr(type, "id") === typeId);
  const name = `${stringAttr(profile, "name")} ${stringAttr(profile, "typeName")} ${byId ? stringAttr(byId, "name") : ""}`.toLowerCase();
  return /unit|character|monster|hero|war machine/.test(name) && !/weapon|ability|spell/.test(name);
}

function isUnitEntry(type: string): boolean { return type === "unit" || type === "model" || type === "selectionEntry"; }

function inferRole(type: string, keywords: string[], profiles: Array<{ name: string }>): string {
  const corpus = `${type} ${keywords.join(" ")} ${profiles.map((profile) => profile.name).join(" ")}`.toLowerCase();
  if (/manifestation/.test(corpus)) return "manifestation";
  if (/terrain/.test(corpus)) return "terrain";
  if (/hero|wizard|priest/.test(corpus)) return "hero";
  return "unit";
}

function catalogueCategories(node: Node): string[] {
  return [...nodes(node.categoryEntries).map((category) => stringAttr(category, "name")), ...nodes(node.categories).flatMap((group) => nodes(group.categoryEntries).map((category) => stringAttr(category, "name")))];
}

function unique<T>(items: T[]): T[] { return [...new Set(items)]; }
function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
