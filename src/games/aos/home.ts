// Pure derivations for the sigmar world home, the war ledger (docs/ui-standard.md §3, "World homes").
// No database, React or Next imports (CLAUDE.md rule 2); everything is computed per request, nothing stored.

/** How many ink tones the banners rotate through (ledger.module.css `.tone0` … `.tone5`). */
export const BANNER_TONES = 6;

export interface LedgerFactionInput {
  name: string;
  models: number;
  painted: number;
}

export interface LedgerBanner {
  name: string;
  models: number;
  painted: number;
  /** Whole percent painted; 100 only when every model is painted, 0 only when none is. */
  percent: number;
  /** Index into the rotating ink tones; by position, never by faction name. */
  tone: number;
}

/** Whole percent painted. Never rounds up to 100 or down to 0, so the ink never claims a finish it has not reached. */
export function paintedPercent(models: number, painted: number): number {
  if (models <= 0 || painted <= 0) return 0;
  if (painted >= models) return 100;
  return Math.min(99, Math.max(1, Math.round((painted / models) * 100)));
}

/** The banners shown on the host page: the largest factions first (as given), at most `limit`, plus what is left out. */
export function ledgerBanners(factions: readonly LedgerFactionInput[], limit: number): { banners: LedgerBanner[]; hidden: number } {
  const shown = factions.slice(0, Math.max(0, limit));
  return {
    banners: shown.map((f, i) => ({ name: f.name, models: f.models, painted: f.painted, percent: paintedPercent(f.models, f.painted), tone: i % BANNER_TONES })),
    hidden: Math.max(0, factions.length - shown.length),
  };
}

/** Splits a ledger entry's name into its initial (the drop cap) and the rest; the initial is one whole character. */
export function dropCap(name: string): { initial: string; rest: string } {
  const trimmed = name.trim();
  const chars = Array.from(trimmed);
  return { initial: chars[0] ?? "", rest: chars.slice(1).join("") };
}

export interface LedgerEntryInput {
  id: string;
  name: string;
  configured: boolean;
}

/** Ready-made armies in ledger order: configured ones first, otherwise the pack's own order. */
export function ledgerEntries<T extends LedgerEntryInput>(options: readonly T[], limit: number): { entries: T[]; hidden: number } {
  const ordered = [...options.filter((o) => o.configured), ...options.filter((o) => !o.configured)];
  const entries = ordered.slice(0, Math.max(0, limit));
  return { entries, hidden: ordered.length - entries.length };
}

/** A played-on date (YYYY-MM-DD) as the owner's locale writes it; read as a calendar day, never shifted by time zone. */
export function formatPlayedOn(locale: "de" | "en", isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(locale === "de" ? "de-AT" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
