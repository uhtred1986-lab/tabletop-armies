import { normalizeName } from "./matching";
import { readPdfPageLines } from "./pdf-text";

export type AosUnitTarget = { id: string; name: string };

export async function parseAosBattleProfilesPdf(input: { path: string; sourceUrl: string; units: readonly AosUnitTarget[] }) {
  const document = await readPdfPageLines(input.path);
  const rows = extractBattleProfileRows(document.pages);
  const candidates = rows.map((row, index) => {
    const matches = input.units.filter((unit) => normalizeName(unit.name) === normalizeName(row.name));
    return {
      entityKind: "points",
      sourceId: `${input.sourceUrl}#page=${row.page}#row=${index + 1}`,
      ...(matches.length === 1 ? { matchTargetId: matches[0]!.id, matchConfidence: 1 } : {}),
      proposed: {
        name: row.name,
        points: row.points,
        unitSize: row.unitSize,
        sourceUrl: input.sourceUrl,
        page: row.page,
        extractedRow: row.sourceText,
        matchCandidates: matches.map((unit) => ({ targetId: unit.id, targetName: unit.name, confidence: 1, exact: true })),
        reviewFlags: [
          "owner-review-required",
          ...(matches.length === 1 ? [] : [matches.length ? "ambiguous-name-match" : "no-exact-unit-match"]),
          "positioned-source-columns",
        ],
      },
    };
  });
  const headers = document.pages.flatMap(({ lines }) => lines.filter((line) =>
    /UNIT\s+SIZE/i.test(line) && /POINTS/i.test(line) && /\b(HEROES|UNITS)\b/i.test(line),
  ));
  const report = {
    pageCount: document.pageCount,
    extractedRows: rows.length,
    exactUnitMatches: candidates.filter(({ matchTargetId }) => Boolean(matchTargetId)).length,
    unmatchedRows: candidates.filter(({ matchTargetId }) => !matchTargetId).length,
    headers,
    extractionMethod: "positioned-table-columns",
    warnings: [
      "Extracted points and unit size are review candidates; no catalogue values are applied automatically.",
      ...(rows.length ? [] : ["No table rows matched the supported text layout; enter points manually or inspect the source PDF layout."]),
    ],
  };
  return { candidates, report };
}

type PositionedItem = { text: string; x: number; y: number };
type PositionedPage = { page: number; items: PositionedItem[] };
type BattleProfileRow = { page: number; name: string; unitSize: number | string; points: number; sourceText: string; kind: "heroes" | "units"; legends: boolean };

/** Uses the PDF's labeled column positions; joined text alone can include regimental notes after the points. */
export function extractBattleProfileRows(pages: readonly PositionedPage[]): BattleProfileRow[] {
  const rows: BattleProfileRow[] = [];
  for (const page of pages) {
    const grouped = new Map<number, PositionedItem[]>();
    for (const item of page.items) {
      const y = Math.round(item.y / 2) * 2;
      grouped.set(y, [...(grouped.get(y) ?? []), item]);
    }
    const lines = [...grouped.entries()].sort(([a], [b]) => a - b).map(([y, items]) => ({ y, items: items.sort((a, b) => a.x - b.x) }));
    let active: { kind: "heroes" | "units"; legends: boolean; unitX: number; pointsX: number; endX: number } | undefined;
    for (const line of lines) {
      const lineText = line.items.map((item) => item.text).join(" ").toUpperCase();
      // AoS PDFs also contain unrelated TYPE / NAME / POINTS tables. Stop using
      // a previous unit-profile header when the document switches table shape.
      if (/\bTYPE\b/.test(lineText) && /\bNAME\b/.test(lineText) && /\bPOINTS\b/.test(lineText) && !/UNIT\s+SIZE/.test(lineText)) {
        active = undefined;
        continue;
      }
      if (/UNIT SIZE/.test(lineText) && /POINTS/.test(lineText)) {
        const unitHeader = line.items.find((item) => /UNIT\s+SIZE/i.test(item.text));
        const pointsHeader = line.items.find((item) => /^POINTS$/i.test(item.text.trim()));
        const kindHeader = line.items.find((item) => /\b(HEROES|UNITS)\b/i.test(item.text.trim()));
        const endHeader = line.items.find((item) => /^(REGIMENT OPTIONS|RELEVANT KEY WORDS)$/i.test(item.text.trim()));
        if (unitHeader && pointsHeader && kindHeader) {
          active = {
            kind: /\bHEROES\b/i.test(kindHeader.text.trim()) ? "heroes" : "units",
            legends: /\bLEGENDS\b/.test(lineText),
            unitX: unitHeader.x,
            pointsX: pointsHeader.x,
            endX: endHeader?.x ?? pointsHeader.x + 48,
          };
          continue;
        }
      }
      if (!active) continue;
      const sizeText = line.items.find((item) => item.x >= active!.unitX && item.x < active!.pointsX && /^\d{1,3}(?:-\d{1,3})?$/.test(item.text.trim()))?.text.trim();
      const pointsText = line.items.find((item) => item.x >= active!.pointsX && item.x < active!.endX && /^\d{1,4}$/.test(item.text.trim()))?.text.trim();
      if (!sizeText || pointsText === undefined) continue;
      const name = line.items.filter((item) => item.x < active!.unitX).map((item) => item.text)
        .join(" ").replace(/[\u0000-\u001f]/g, " ").replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s+/g, " ").trim();
      if (!name || /^(HEROES|UNITS|LEGENDS)$/i.test(name)) continue;
      const parsedSize = Number(sizeText);
      rows.push({
        page: page.page,
        kind: active.kind,
        legends: active.legends,
        name,
        unitSize: Number.isFinite(parsedSize) ? parsedSize : sizeText,
        points: Number(pointsText),
        sourceText: line.items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(),
      });
    }
  }
  return rows;
}

/** Recognizes a conservative text-row shape only; it never guesses a points value from an unlabelled number. */
export function parseBattleProfileLine(line: string): { name: string; unitSize: number; points: number; sourceText: string } | undefined {
  const match = line.trim().match(/^(.+?)\s+(\d{1,3})\s+(\d{1,4})(?:\s*[†*])?$/);
  if (!match) return undefined;
  const name = match[1]!.trim();
  const unitSize = Number(match[2]);
  const points = Number(match[3]);
  if (!name || unitSize < 1 || points < 0 || points > 0 && points < unitSize) return undefined;
  return { name, unitSize, points, sourceText: line.trim() };
}
