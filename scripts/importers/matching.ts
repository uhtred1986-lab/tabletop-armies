import { createHash } from "node:crypto";

export const stableId = (namespace: string, sourceId: string) =>
  `${namespace}_${createHash("sha256").update(`${namespace}\0${sourceId}`).digest("hex").slice(0, 16)}`;

export const normalizeName = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

export type MatchCandidate<T> = { target: T; confidence: number; exact: boolean };

/** Name matches are suggestions only. Callers must preserve every ambiguity for owner review. */
export function suggestNameMatches<T extends { id: string; name: string }>(
  name: string,
  targets: readonly T[],
  threshold = 0.82,
): MatchCandidate<T>[] {
  const source = normalizeName(name);
  if (!source) return [];
  return targets
    .map((target) => {
      const candidate = normalizeName(target.name);
      const exact = source === candidate;
      const confidence = exact ? 1 : tokenSimilarity(source, candidate);
      return { target, confidence, exact };
    })
    .filter((candidate) => candidate.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence || a.target.name.localeCompare(b.target.name));
}

/** Dice coefficient on word bigrams keeps fuzzy suggestions transparent and deterministic. */
function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const left = new Set(bigrams(a));
  const right = new Set(bigrams(b));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const item of left) if (right.has(item)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

function bigrams(value: string): string[] {
  const padded = ` ${value} `;
  return Array.from({ length: Math.max(0, padded.length - 1) }, (_, index) => padded.slice(index, index + 2));
}

export function stableSourceRevision(source: string | Uint8Array): string {
  return createHash("sha256").update(source).digest("hex");
}
