import type { Issue, ListValidationResult, ListValidationSettings } from "./types";
import type { ZodType } from "zod";

export const validationResult = (issues: Issue[]): ListValidationResult => ({
  issues,
  status: issues.some((issue) => issue.preventsCompleteValidation) ? "incomplete" : "complete",
});

export const missingConfig = (rule: string, key: string, path: string): Issue => ({
  rule,
  severity: "warning",
  messageKey: key,
  path,
  values: { path },
  preventsCompleteValidation: true,
});

export const listSelections = (input: unknown): { selections: unknown; dataPackId?: string; gameId?: string; schemaVersion?: number; name?: string; settings: Record<string, unknown> } => {
  if (input && typeof input === "object" && "selections" in input) {
    const value = input as { selections: unknown; dataPackId?: unknown; gameId?: unknown; schemaVersion?: unknown; name?: unknown; settings?: unknown };
    return {
      selections: value.selections,
      dataPackId: typeof value.dataPackId === "string" ? value.dataPackId : undefined,
      gameId: typeof value.gameId === "string" ? value.gameId : undefined,
      schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : undefined,
      name: typeof value.name === "string" ? value.name : undefined,
      settings: value.settings && typeof value.settings === "object" ? value.settings as Record<string, unknown> : {},
    };
  }
  return { selections: input, settings: {} };
};

export const definitionIssues = (envelope: ReturnType<typeof listSelections>, gameId: string, pack: unknown): Issue[] => {
  const issues: Issue[] = [];
  if (envelope.schemaVersion !== 1 || envelope.gameId !== gameId || !envelope.dataPackId || !envelope.name?.trim()) {
    issues.push({ rule: "definition.shape", severity: "error", messageKey: "issue.list.definitionShape", preventsCompleteValidation: true });
    return issues;
  }
  const currentPackId = pack && typeof pack === "object" ? String((pack as Record<string, unknown>).packId ?? "") : "";
  if (envelope.dataPackId !== currentPackId) issues.push({ rule: "pack.outdated", severity: "warning", messageKey: "issue.pack.mismatch", values: { built: envelope.dataPackId, current: currentPackId } });
  return issues;
};

export const settingsWithEnvelope = (settings: ListValidationSettings, envelopeSettings: Record<string, unknown>): ListValidationSettings => ({
  ...settings,
  constraints: { ...envelopeSettings, ...settings.constraints },
});

export const packSchemaIssues = (schema: ZodType, pack: unknown): Issue[] => schema.safeParse(pack).success ? [] : [{
  rule: "pack.invalid",
  severity: "error",
  messageKey: "issue.pack.invalid",
  preventsCompleteValidation: true,
}];
