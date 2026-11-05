import { createHash } from "node:crypto";

export type RulePdfPage = { page: number; text: string };
export type RuleCandidateKind = "mode" | "scenario";

export type RulePdfCandidateSeed = {
  kind: RuleCandidateKind;
  name: string;
  modeType?: string;
  tags?: string[];
  /** Explicit source pages for this record. Omit to attach the whole document. */
  pages?: number[];
  /** Only caller-verified suggestions are copied; this helper never infers figure requirements. */
  figureSuggestions?: Array<{
    unitId?: string;
    figureName?: string;
    matchTargetId?: string | null;
    rationale?: string;
    page?: number;
    strength?: "required" | "suggested";
  }>;
};

export type RulePdfDraftInput = {
  gameId: "aos" | "mcp" | "legion" | "shatterpoint" | "bmg";
  sourceUrl: string;
  /** The source's printed/publication date, not the import or fetch date. */
  sourceDate?: string;
  sourceSha256: string;
  documentTitle: string;
  documentType: string;
  pages: readonly RulePdfPage[];
  candidates: readonly RulePdfCandidateSeed[];
};

export type RulePdfSection = {
  id: string;
  title: string;
  text: string;
  sourcePages: number[];
  sourceRef: string;
};

/**
 * Build owner-review records from already extracted PDF text. The caller must supply document identity and any
 * mode/scenario candidates from a source-backed review; this function does not decide what rules mean.
 */
export function buildRulePdfDraft(input: RulePdfDraftInput) {
  validateInput(input);
  const source = new URL(input.sourceUrl).toString();
  const pages = [...input.pages].sort((a, b) => a.page - b.page);
  const sections = pages.map((page) => pageSection(source, page));
  const documentId = stableId("rule-document", `${input.gameId}:${source}`);
  const document = {
    id: documentId,
    title: input.documentTitle.trim(),
    documentType: input.documentType.trim(),
    gameId: input.gameId,
    sourceUrl: source,
    ...(input.sourceDate ? { sourceDate: input.sourceDate } : {}),
    sha256: input.sourceSha256.toLowerCase(),
    pageCount: pages.length,
    extractedCharacters: pages.reduce((total, page) => total + page.text.length, 0),
    emptyPages: pages.filter((page) => !page.text.trim()).map(({ page }) => page),
    sections,
    reviewFlags: ["source-text-only", "owner-review-required", "no-rules-interpreted"],
  };

  const candidates = input.candidates.map((seed) => {
    const selectedPages = seed.pages ? seed.pages.map((pageNumber) => {
      const page = pages.find(({ page }) => page === pageNumber);
      if (!page) throw new Error(`Candidate ${seed.name} refers to missing PDF page ${pageNumber}`);
      return page;
    }) : pages;
    const candidateSections = selectedPages.map((page) => pageSection(source, page));
    const id = stableId(`rule-${seed.kind}`, `${input.gameId}:${source}:${seed.name.trim().toLocaleLowerCase("en-US")}`);
    return {
      entityKind: seed.kind,
      sourceId: `${source}#${seed.kind}:${id}`,
      proposed: {
        id,
        name: seed.name.trim(),
        gameId: input.gameId,
        ...(seed.modeType ? { modeType: seed.modeType } : {}),
        sourceUrl: source,
        ...(input.sourceDate ? { sourceDate: input.sourceDate } : {}),
        tags: [...new Set(seed.tags ?? [])],
        sections: candidateSections,
        figureSuggestions: (seed.figureSuggestions ?? []).map((suggestion) => ({
          ...(suggestion.unitId ? { unitId: suggestion.unitId } : {}),
          ...(suggestion.figureName ? { figureName: suggestion.figureName } : {}),
          ...(suggestion.matchTargetId !== undefined ? { matchTargetId: suggestion.matchTargetId } : {}),
          ...(suggestion.rationale ? { rationale: suggestion.rationale } : {}),
          ...(suggestion.page ? { sourceRef: `${source}#page=${suggestion.page}` } : {}),
          ...(suggestion.strength ? { strength: suggestion.strength } : {}),
        })),
        missingSections: [],
        reviewFlags: [
          "owner-review-required",
          "source-text-extracted-without-rule-interpretation",
          ...(seed.figureSuggestions?.length ? ["figure-suggestions-owner-verified"] : ["figure-requirements-not-inferred"]),
        ],
      },
    };
  });

  return { document, candidates };
}

function pageSection(sourceUrl: string, page: RulePdfPage): RulePdfSection {
  return {
    id: `page-${page.page}`,
    title: `Page ${page.page}`,
    text: page.text,
    sourcePages: [page.page],
    sourceRef: `${sourceUrl}#page=${page.page}`,
  };
}

function validateInput(input: RulePdfDraftInput): void {
  if (!/^https:\/\//i.test(input.sourceUrl)) throw new Error("Rule PDF sourceUrl must use HTTPS");
  if (!input.documentTitle.trim()) throw new Error("Rule PDF documentTitle is required");
  if (!input.documentType.trim()) throw new Error("Rule PDF documentType is required");
  if (!/^[a-f\d]{64}$/i.test(input.sourceSha256)) throw new Error("Rule PDF sourceSha256 must be a SHA-256 digest");
  if (!input.pages.length) throw new Error("Rule PDF needs at least one extracted page");
  const pageNumbers = new Set<number>();
  for (const page of input.pages) {
    if (!Number.isSafeInteger(page.page) || page.page < 1) throw new Error("PDF page numbers must be positive integers");
    if (pageNumbers.has(page.page)) throw new Error(`Duplicate PDF page ${page.page}`);
    pageNumbers.add(page.page);
    if (typeof page.text !== "string") throw new Error(`PDF page ${page.page} has invalid extracted text`);
  }
  const candidateIds = new Set<string>();
  for (const seed of input.candidates) {
    if (!seed.name.trim()) throw new Error("Rule PDF candidate name is required");
    const key = `${seed.kind}:${seed.name.trim().toLocaleLowerCase("en-US")}`;
    if (candidateIds.has(key)) throw new Error(`Duplicate rule PDF candidate: ${seed.name}`);
    candidateIds.add(key);
    for (const suggestion of seed.figureSuggestions ?? []) {
      if (!suggestion.unitId && !suggestion.figureName?.trim()) throw new Error("Figure suggestions need an owner-verified unitId or figureName");
      if (suggestion.page !== undefined && !pageNumbers.has(suggestion.page)) throw new Error(`Figure suggestion refers to missing PDF page ${suggestion.page}`);
    }
  }
}

function stableId(namespace: string, value: string): string {
  const digest = createHash("sha256").update(`${namespace}\0${value}`).digest("hex").slice(0, 16);
  return `${namespace.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${digest}`;
}
