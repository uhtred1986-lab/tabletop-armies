/**
 * What a Vercel build does to the database — the pure half (copied from Gullet Cove, #194/#195 there).
 *
 * `scripts/vercel-build.mts` reads the environment, the drizzle journal and
 * (read-only) `drizzle.__drizzle_migrations`, then asks this module what to do.
 * Everything here is a function of its arguments, so `npm test`
 * (`scripts/verify-deploy.mts`) can walk every branch without a network.
 *
 * The rules, in the words of docs/architecture/platform.md:
 * - production migrates only what is pending, and only after a Neon branch
 *   snapshot of production succeeded; missing Neon credentials with a pending
 *   migration refuse the build (fail closed);
 * - a preview migrates only when its DATABASE_URL provably points at a
 *   different Neon endpoint than production's (`PRODUCTION_DATABASE_HOST`);
 *   when that cannot be proven it builds without migrating;
 * - outside Vercel (`VERCEL_ENV` unset) nothing touches a database.
 */

/** One row of `drizzle/meta/_journal.json`'s `entries`. */
export type JournalEntry = { idx: number; when: number; tag: string };

/** One row of `drizzle.__drizzle_migrations` (created_at is the entry's `when`). */
export type AppliedMigration = { created_at: number | string };

export type MigrationState = {
  /** Entries drizzle-kit will apply on the next `migrate`, in journal order. */
  pending: JournalEntry[];
  /**
   * Entries drizzle-kit will silently never apply: older than the newest
   * applied migration, yet not applied themselves — what merging two
   * migrations in the opposite order to their generation produces. Only
   * reported after the newest applied row the journal no longer names: before
   * that point history was rewritten (production holds rows for 0021-0028
   * under timestamps an earlier journal repair changed), and that is not news.
   */
  skipped: JournalEntry[];
};

/**
 * Mirrors drizzle-orm's `PgDialect.migrate`: it reads only the newest applied
 * row and applies every journal entry whose `when` is later. Applied rows store
 * the journal's `when` as `created_at`, so "was this entry applied" is an exact
 * match on that number — no hashing, which line endings would break.
 */
export function migrationState(journal: JournalEntry[], applied: AppliedMigration[]): MigrationState {
  const appliedAt = new Set(applied.map((row) => Number(row.created_at)));
  const last = applied.length === 0 ? null : Math.max(...appliedAt);
  const inJournal = new Set(journal.map((entry) => entry.when));
  const orphans = [...appliedAt].filter((when) => !inJournal.has(when));
  const rewrittenUpTo = orphans.length === 0 ? -Infinity : Math.max(...orphans);
  const pending: JournalEntry[] = [];
  const skipped: JournalEntry[] = [];
  for (const entry of journal) {
    if (last === null || last < entry.when) pending.push(entry);
    else if (!appliedAt.has(entry.when) && entry.when > rewrittenUpTo) skipped.push(entry);
  }
  return { pending, skipped };
}

/**
 * A Neon endpoint id from a host or a connection string:
 * `ep-cool-darkness-123456-pooler.eu-central-1.aws.neon.tech` -> `ep-cool-darkness-123456`.
 * The pooled and direct hosts of one branch give the same id. Anything that is
 * not recognisably a host yields null.
 */
export function endpointIdOf(hostOrUrl: string | undefined): string | null {
  if (!hostOrUrl) return null;
  let host = hostOrUrl.trim();
  if (!host) return null;
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  const label = host.split(".")[0]?.toLowerCase() ?? "";
  if (!label) return null;
  return label.replace(/-pooler$/, "");
}

export type BuildEnv = {
  VERCEL_ENV?: string;
  DATABASE_URL?: string;
  PRODUCTION_DATABASE_HOST?: string;
  NEON_API_KEY?: string;
  NEON_PROJECT_ID?: string;
};

export type Target =
  | { kind: "local"; reason: string }
  | { kind: "production" }
  | { kind: "preview-own-db"; reason: string }
  | { kind: "preview-shared-db"; reason: string };

/** Which database this build may migrate, before looking at any migration. */
export function classifyBuild(env: BuildEnv): Target {
  const vercelEnv = env.VERCEL_ENV?.trim();
  if (!vercelEnv) {
    return { kind: "local", reason: "VERCEL_ENV is not set, so this is not a Vercel deploy; no database is touched." };
  }
  if (vercelEnv === "production") return { kind: "production" };

  // preview, development, or anything Vercel adds later: migrate only on proof.
  const own = endpointIdOf(env.DATABASE_URL);
  if (!own) {
    return { kind: "preview-shared-db", reason: "DATABASE_URL is not set, so there is nothing this preview could migrate." };
  }
  const production = endpointIdOf(env.PRODUCTION_DATABASE_HOST);
  if (!production) {
    return {
      kind: "preview-shared-db",
      reason:
        "PRODUCTION_DATABASE_HOST is not set in Vercel's Preview environment, so this build cannot tell its database from production's and will not migrate it.",
    };
  }
  if (own === production) {
    return {
      kind: "preview-shared-db",
      reason: `DATABASE_URL points at production's Neon endpoint (${production}); a preview never migrates it.`,
    };
  }
  return {
    kind: "preview-own-db",
    reason: `DATABASE_URL points at Neon endpoint ${own}, not production's ${production}: this preview has its own branch.`,
  };
}

export type ProductionPlan =
  | { action: "build"; reason: string }
  | { action: "backup-then-migrate"; branchName: string; reason: string }
  | { action: "refuse"; message: string };

/** What a production build does, given what production has not applied yet. */
export function planProduction(env: BuildEnv, state: MigrationState, now: Date): ProductionPlan {
  if (state.pending.length === 0) {
    return { action: "build", reason: "Production has applied every migration in drizzle/; no backup, no migrate." };
  }
  const tags = state.pending.map((entry) => entry.tag).join(", ");
  const missing = [
    ...(env.NEON_API_KEY?.trim() ? [] : ["NEON_API_KEY"]),
    ...(neonProjectId(env) ? [] : ["NEON_PROJECT_ID"]),
  ];
  if (missing.length > 0) {
    return {
      action: "refuse",
      message:
        `Production has ${state.pending.length} pending migration(s) (${tags}), and a migration only runs after a Neon backup branch. ` +
        `Add ${missing.join(" and ")} to Vercel's Production environment (docs/architecture/platform.md, "Deploys and the database") and redeploy.`,
    };
  }
  return {
    action: "backup-then-migrate",
    branchName: backupBranchName(now, state.pending[0]!.tag),
    reason: `Production has ${state.pending.length} pending migration(s): ${tags}.`,
  };
}

/** The prefix every backup branch carries; retention never touches any other branch. */
export const BACKUP_PREFIX = "pre-migrate-";

/** How many backup branches survive a successful migration (Neon free plan's branch limit is tight). */
export const BACKUPS_KEPT = 2;

/**
 * The backup branches to delete after a successful migration: every
 * `pre-migrate-*` branch but the newest `keep`, by `created_at` (the name's
 * timestamp breaks ties). Anything not named `pre-migrate-*` is never returned.
 */
export function branchesToPrune<B extends { name: string; created_at?: string }>(branches: B[], keep = BACKUPS_KEPT): B[] {
  const backups = branches.filter((branch) => branch.name.startsWith(BACKUP_PREFIX));
  backups.sort(
    (a, b) =>
      (Date.parse(b.created_at ?? "") || 0) - (Date.parse(a.created_at ?? "") || 0) || b.name.localeCompare(a.name),
  );
  return backups.slice(Math.max(0, keep));
}

/** The Neon project id (the production project, not an empty integration project). */
export function neonProjectId(env: BuildEnv): string | undefined {
  return env.NEON_PROJECT_ID?.trim() || undefined;
}

/** `pre-migrate-20260923T101500Z-0080_some_tag`, kept inside Neon's name limit. */
export function backupBranchName(now: Date, firstPendingTag: string): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${BACKUP_PREFIX}${stamp}-${firstPendingTag}`.slice(0, 200);
}
