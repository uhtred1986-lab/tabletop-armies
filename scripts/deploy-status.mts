/**
 * Where the Vercel production deploy of `main` stands, and why it failed if it did.
 *
 *   npm run deploy:status            # the latest production deployments
 *   npm run deploy:status -- --wait  # wait for the newest to finish (up to 20 min); exit 1 unless READY
 *
 * Needs VERCEL_TOKEN. Read-only: it never deploys, promotes or changes settings. Prints the build log's last lines on
 * an error (the build runs migrations after the pre-migrate backup, scripts/vercel-build.mts).
 */
const PROJECT = process.env.VERCEL_PROJECT?.trim() || "prj_nH0LcYxxCrzbqCQED8jBdvLKVUQl";
const TEAM = process.env.VERCEL_TEAM?.trim() || "team_ZMippPGf1OxvxZKLaa0RxqTg";

async function vercel(path: string): Promise<Record<string, unknown>> {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) throw new Error("VERCEL_TOKEN is not set");
  const res = await fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Vercel ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return await res.json() as Record<string, unknown>;
}

interface Deployment { uid: string; url: string; state: string; created: number; meta?: { githubCommitSha?: string; githubCommitMessage?: string } }
const latest = async () => (await vercel(`/v6/deployments?projectId=${PROJECT}&target=production&limit=5`) as { deployments: Deployment[] }).deployments;
const line = (d: Deployment) => `${d.state.padEnd(9)} ${new Date(d.created).toISOString()} ${d.meta?.githubCommitSha?.slice(0, 7) ?? "-------"} ${(d.meta?.githubCommitMessage ?? "").split("\n")[0]!.slice(0, 60)}  https://${d.url}`;

let list = await latest();
if (process.argv.includes("--wait")) {
  const deadline = Date.now() + 20 * 60_000;
  while (list[0] && !["READY", "ERROR", "CANCELED"].includes(list[0].state) && Date.now() < deadline) {
    console.error(line(list[0]));
    await new Promise((r) => setTimeout(r, 15_000));
    list = await latest();
  }
}
for (const d of list) console.log(line(d));
const newest = list[0];
if (newest?.state === "ERROR") {
  const events = await vercel(`/v3/deployments/${newest.uid}/events?limit=-1`) as unknown as Array<{ text?: string; payload?: { text?: string } }>;
  console.log("\nLast build lines:\n" + events.map((e) => e.text ?? e.payload?.text ?? "").filter(Boolean).slice(-30).join("\n"));
}
if (process.argv.includes("--wait") && newest?.state !== "READY") process.exit(1);
