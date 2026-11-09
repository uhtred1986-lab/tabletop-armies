/**
 * Throwaway Neon branches for screen work (issue #6). Never touches production: branches are children of the isolated
 * test branch, and every command refuses a branch whose name does not start with "tmp-".
 *
 *   npx tsx scripts/tmp-branch.mts create tmp-home-ledger-20261107   # child of the test branch, prints its id only
 *   npx tsx scripts/tmp-branch.mts env tmp-home-ledger-20261107      # writes .env.development.local (git-ignored)
 *   npx tsx scripts/tmp-branch.mts sql tmp-home-ledger-20261107 data/seed.sql   # runs SQL over HTTPS (port 5432 is blocked in cloud sessions)
 *   npx tsx scripts/tmp-branch.mts delete tmp-home-ledger-20261107
 *
 * Needs NEON_API_KEY. TMP_BRANCH_PROJECT and TMP_BRANCH_PARENT override the defaults. NEON_PROJECT_ID is deliberately
 * NOT read: in cloud sessions it can belong to another app (Gullet Cove), and the script checks the project's name. The connection string is never
 * printed. Seed data must be invented (CLAUDE.md, "No publisher data"); keep seed files in the git-ignored data/.
 * Then: `npm run dev` reads .env.development.local; unset any DATABASE_URL your shell inherited first.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PROJECT, assertOwnProject, branches, connectionUri, neon } from "./lib/neon-api.mts";

/** The isolated v1 test branch (`dev-all-milestones-v1-20261105`), never production. */
const PARENT = process.env.TMP_BRANCH_PARENT?.trim() || "br-red-recipe-b9p3guih";

async function branchId(name: string): Promise<string> {
  const branch = (await branches()).find((b) => b.name === name);
  if (!branch) throw new Error(`No branch named ${name}`);
  if (branch.default) throw new Error("Refusing to touch the default (production) branch");
  return branch.id;
}

const uri = async (name: string) => connectionUri(await branchId(name));

const [command, name, file] = process.argv.slice(2);
if (!command || !name) throw new Error("Usage: tmp-branch.mts <create|env|sql|delete> <tmp-name> [sql-file]");
if (!name.startsWith("tmp-")) throw new Error('Branch names must start with "tmp-" so production can never be named here');
await assertOwnProject();

if (command === "create") {
  const { branch } = await neon(`/projects/${PROJECT}/branches`, { method: "POST", body: JSON.stringify({ branch: { parent_id: PARENT, name }, endpoints: [{ type: "read_write" }] }) }) as { branch: { id: string } };
  console.log(`Created ${name} (${branch.id}) from ${PARENT}`);
} else if (command === "env") {
  writeFileSync(".env.development.local", `DATABASE_URL=${await uri(name)}\nDB_DRIVER=neon-ws\nAUTH_DISABLED=1\n`, { mode: 0o600 });
  console.log(`Wrote .env.development.local for ${name} (git-ignored; delete it with the branch)`);
} else if (command === "sql") {
  if (!file) throw new Error("Pass the SQL file to run");
  const connection = await uri(name);
  const host = new URL(connection).hostname;
  const res = await fetch(`https://${host}/sql`, { method: "POST", headers: { "Neon-Connection-String": connection, "Content-Type": "application/json" }, body: JSON.stringify({ query: readFileSync(file, "utf8"), params: [] }) });
  const body = await res.text();
  if (!res.ok) throw new Error(`SQL failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  console.log(`Ran ${file} on ${name}`);
} else if (command === "delete") {
  await neon(`/projects/${PROJECT}/branches/${await branchId(name)}`, { method: "DELETE" });
  console.log(`Deleted ${name}. Remove .env.development.local too if it pointed there.`);
} else throw new Error(`Unknown command ${command}`);
