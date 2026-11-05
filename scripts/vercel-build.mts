/**
 * Vercel's build command (`vercel.json` -> `npm run vercel-build`), copied from Gullet Cove (#194, #195 there).
 *
 * Only `main` deploys (vercel.json). A production build:
 *
 * - **production**: reads which migrations production has applied (a SELECT on
 *   `drizzle.__drizzle_migrations`). Nothing pending: `next build`. Something pending: a Neon backup branch of production first, then
 *   `drizzle-kit migrate`, then old backups pruned to the newest two, then
 *   `next build`; no backup (or no NEON_API_KEY / project id) fails the build
 *   before anything is migrated.
 * - **preview / development**: migrates only a database that is provably not
 *   production's (`PRODUCTION_DATABASE_HOST` set and a different Neon
 *   endpoint). This project runs no per-preview branches (branch limit), so in
 *   practice previews never migrate; the build says so.
 * - **not on Vercel** (`VERCEL_ENV` unset): just `next build`.
 *
 * The decisions are in `scripts/lib/deploy-plan.mts` and tested by
 * `npm test`; this file is only the I/O. Docs: docs/architecture/platform.md,
 * "Deploys and the database".
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import {
  BACKUPS_KEPT,
  classifyBuild,
  migrationState,
  neonProjectId,
  planProduction,
  type AppliedMigration,
  type BuildEnv,
  type JournalEntry,
  type MigrationState,
} from "./lib/deploy-plan.mts";
import { createBackupBranch, pruneBackupBranches } from "./lib/neon-backup.mts";

const env = process.env as BuildEnv;
const log = (line: string) => console.log(`[vercel-build] ${line}`);

function fail(message: string): never {
  console.error(`[vercel-build] BUILD STOPPED: ${message}`);
  process.exit(1);
}

function run(script: string) {
  log(`npm run ${script}`);
  const result = spawnSync("npm", ["run", script], { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) fail(`npm run ${script} exited with ${result.status ?? result.signal}.`);
}

function backfillCollection() {
  log("Running the idempotent legacy collection backfill.");
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/backfill-collection.mts"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) fail(`collection backfill exited with ${result.status ?? result.signal}.`);
}

function readJournal(): JournalEntry[] {
  const file = path.join(process.cwd(), "drizzle", "meta", "_journal.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { entries: JournalEntry[] }).entries;
}

/** Read-only: which migrations the database at `url` has applied. */
async function readApplied(url: string): Promise<AppliedMigration[]> {
  const sql = postgres(url, {
    max: 1,
    connect_timeout: 15,
    ssl: url.includes("sslmode=require") ? "require" : false,
    prepare: !url.includes("-pooler"),
    onnotice: () => {},
  });
  try {
    return await sql<AppliedMigration[]>`select created_at from drizzle.__drizzle_migrations`;
  } catch (error) {
    // 3F000 no schema, 42P01 no table: a database drizzle has never migrated.
    const code = (error as { code?: string }).code;
    if (code === "3F000" || code === "42P01") return [];
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function describe(state: MigrationState) {
  if (state.skipped.length > 0) {
    log(
      `WARNING: drizzle-kit will never apply ${state.skipped.map((e) => e.tag).join(", ")} — each is older than the newest applied migration but was not applied itself (two branches generated the same migration number?). Regenerate it on top of main.`,
    );
  }
}

const target = classifyBuild(env);
log(`VERCEL_ENV=${env.VERCEL_ENV ?? "(unset)"} -> ${target.kind}`);

if (target.kind === "local") {
  log(target.reason);
} else if (target.kind === "preview-own-db") {
  log(target.reason);
  run("db:migrate");
  backfillCollection();
} else if (target.kind === "preview-shared-db") {
  log(`${target.reason} Skipping db:migrate.`);
  if (env.DATABASE_URL) {
    try {
      const state = migrationState(readJournal(), await readApplied(env.DATABASE_URL));
      if (state.pending.length > 0) {
        log(
          `This preview runs against production WITHOUT its ${state.pending.length} pending migration(s): ${state.pending.map((e) => e.tag).join(", ")}. Screens that need them will fail here; they land when main deploys.`,
        );
      }
      describe(state);
    } catch (error) {
      log(`(Could not read the applied migrations: ${(error as Error).message})`);
    }
  }
} else {
  if (!env.DATABASE_URL) fail("DATABASE_URL is not set in Vercel's Production environment.");
  let state: MigrationState;
  try {
    state = migrationState(readJournal(), await readApplied(env.DATABASE_URL));
  } catch (error) {
    fail(`could not read production's applied migrations: ${(error as Error).message}`);
  }
  describe(state);
  const plan = planProduction(env, state, new Date());
  if (plan.action === "refuse") fail(plan.message);
  if (plan.action === "build") {
    log(plan.reason);
  } else {
    log(`${plan.reason} Backing up production to Neon branch "${plan.branchName}" first.`);
    const neon = {
      apiKey: env.NEON_API_KEY!,
      projectId: neonProjectId(env)!,
      fetch,
      sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    };
    try {
      const backup = await createBackupBranch(neon, env.DATABASE_URL, plan.branchName);
      log(`Backup branch ${backup.branchId} ("${plan.branchName}") made from ${backup.parentId}.`);
    } catch (error) {
      fail(`the backup failed, so nothing was migrated: ${(error as Error).message}`);
    }
    run("db:migrate");
    const pruned = await pruneBackupBranches(neon);
    if (pruned.deleted.length > 0) {
      log(`Kept the newest ${BACKUPS_KEPT} backup branches; deleted ${pruned.deleted.join(", ")}.`);
    }
    for (const failure of pruned.failures) {
      log(`WARNING: could not clean up an old backup branch (the deploy goes on): ${failure}`);
    }
  }
  backfillCollection();
}

run("build");
