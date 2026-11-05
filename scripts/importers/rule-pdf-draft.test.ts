import { describe, expect, it } from "vitest";
import { buildRulePdfDraft } from "./rule-pdf-draft";

const base = {
  gameId: "shatterpoint" as const,
  sourceUrl: "https://publisher.example/rulebook.pdf",
  sourceDate: "2026-04-15",
  sourceSha256: "a".repeat(64),
  documentTitle: "Invented Asymmetric Mission Rules",
  documentType: "scenario-rules",
  pages: [
    { page: 2, text: "Invented objective text for the second page." },
    { page: 1, text: "Invented setup instructions for the first page." },
  ],
  candidates: [{ kind: "scenario" as const, name: "Invented Asymmetric Mission", pages: [2] }],
};

describe("source-backed PDF rule draft", () => {
  it("keeps full page text searchable with stable page references and caller-supplied identity", () => {
    const draft = buildRulePdfDraft(base);

    expect(draft.document).toMatchObject({
      title: "Invented Asymmetric Mission Rules",
      documentType: "scenario-rules",
      gameId: "shatterpoint",
      sourceUrl: "https://publisher.example/rulebook.pdf",
      sourceDate: "2026-04-15",
      pageCount: 2,
      extractedCharacters: 91,
      reviewFlags: ["source-text-only", "owner-review-required", "no-rules-interpreted"],
    });
    expect(draft.document.sections).toEqual([
      {
        id: "page-1",
        title: "Page 1",
        text: "Invented setup instructions for the first page.",
        sourcePages: [1],
        sourceRef: "https://publisher.example/rulebook.pdf#page=1",
      },
      {
        id: "page-2",
        title: "Page 2",
        text: "Invented objective text for the second page.",
        sourcePages: [2],
        sourceRef: "https://publisher.example/rulebook.pdf#page=2",
      },
    ]);
    expect(draft.candidates[0]).toMatchObject({
      entityKind: "scenario",
      proposed: {
        name: "Invented Asymmetric Mission",
        sections: [{ title: "Page 2", sourcePages: [2], text: "Invented objective text for the second page." }],
        figureSuggestions: [],
        reviewFlags: ["owner-review-required", "source-text-extracted-without-rule-interpretation", "figure-requirements-not-inferred"],
      },
    });
  });

  it("keeps document and record IDs stable across content updates", () => {
    const candidates = [{ kind: "scenario" as const, name: "Invented Asymmetric Mission" }];
    const initial = buildRulePdfDraft({ ...base, candidates });
    const revised = buildRulePdfDraft({ ...base, sourceSha256: "b".repeat(64), pages: [{ page: 1, text: "Revised source text." }], candidates });

    expect(revised.document.id).toBe(initial.document.id);
    expect(revised.candidates[0]!.proposed.id).toBe(initial.candidates[0]!.proposed.id);
    expect(revised.document.sha256).not.toBe(initial.document.sha256);
  });

  it("copies only explicit figure suggestions and preserves their source page", () => {
    const draft = buildRulePdfDraft({
      ...base,
      candidates: [{
        kind: "mode",
        name: "Invented Asymmetric Mission",
        figureSuggestions: [{ figureName: "Invented Sentinel", rationale: "Name appears in the mission heading.", page: 2, strength: "suggested" }],
      }],
    });

    expect(draft.candidates[0]!.proposed.figureSuggestions).toEqual([{
      figureName: "Invented Sentinel",
      rationale: "Name appears in the mission heading.",
      sourceRef: "https://publisher.example/rulebook.pdf#page=2",
      strength: "suggested",
    }]);
    expect(draft.candidates[0]!.proposed.reviewFlags).toContain("figure-suggestions-owner-verified");
  });

  it("fails closed on missing pages, empty identities, and invalid figure suggestions", () => {
    expect(() => buildRulePdfDraft({ ...base, candidates: [{ kind: "mode", name: "Missing page", pages: [3] }] })).toThrow("missing PDF page 3");
    expect(() => buildRulePdfDraft({ ...base, documentTitle: " " })).toThrow("documentTitle is required");
    expect(() => buildRulePdfDraft({ ...base, candidates: [{ kind: "mode", name: "Bad figure", figureSuggestions: [{ page: 1 }] }] })).toThrow("owner-verified unitId or figureName");
    expect(() => buildRulePdfDraft({ ...base, pages: [{ page: 1, text: "one" }, { page: 1, text: "duplicate" }] })).toThrow("Duplicate PDF page 1");
  });
});
