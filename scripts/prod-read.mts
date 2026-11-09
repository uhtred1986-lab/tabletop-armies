/**
 * Read-only SQL against Tabletop Armies' production database (or another branch), for checking what is stored.
 *
 *   npm run prod:read -- "select id, game_id, status from import_runs order by id"
 *   npm run prod:read -- --branch dev-all-milestones-v1-20261105 "select count(*) from army_lists"
 *   npm run prod:read -- --json "select ..."          # rows as JSON instead of a table
 *
 * Runs inside a READ ONLY transaction, so Postgres itself refuses any write. Writes to production go through the app
 * or a script after a pre-<task>-<yyyymmdd> backup branch (CLAUDE.md). Needs NEON_API_KEY; the connection string is
 * never printed. Rows can hold the owner's private data: read what the task needs, never paste packs into the repo.
 */
import { neon as sqlClient } from "@neondatabase/serverless";
import { assertOwnProject, branches, connectionUri } from "./lib/neon-api.mts";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(`--${name}`); if (i < 0) return undefined; const [, value] = args.splice(i, 2); return value; };
const json = args.includes("--json") ? (args.splice(args.indexOf("--json"), 1), true) : false;
const branchName = flag("branch");
const query = args.join(" ").trim();
if (!query) throw new Error('Usage: npm run prod:read -- [--branch <name>] [--json] "<select ...>"');

await assertOwnProject();
const all = await branches();
const branch = branchName ? all.find((b) => b.name === branchName) : all.find((b) => b.default);
if (!branch) throw new Error(branchName ? `No branch named ${branchName}` : "No default branch");
const sql = sqlClient(await connectionUri(branch.id));
const [rows] = await sql.transaction([sql.query(query)], { readOnly: true }) as Record<string, unknown>[][];
console.error(`${branch.name}${branch.default ? " (production)" : ""}: ${rows?.length ?? 0} rows`);
if (json) console.log(JSON.stringify(rows, null, 2)); else console.table(rows);
