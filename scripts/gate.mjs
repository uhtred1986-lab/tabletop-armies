// The merge gate (docs/agent-brief.md, "Testing"): typecheck, lint, test, and the build with `-- --build`.
import { spawnSync } from "node:child_process";

const steps = [
  ["typecheck", ["run", "typecheck"]],
  ["lint", ["run", "lint"]],
  ["test", ["test"]],
];
if (process.argv.includes("--build")) steps.push(["build", ["run", "build"]]);

for (const [name, args] of steps) {
  console.log(`\n▶ ${name}`);
  const r = spawnSync("npm", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    // The build runs right after typecheck, so it skips Next's second type check; no DATABASE_URL: the build reads no data.
    env: name === "build" ? { ...process.env, MUSTER_BUILD_SKIP_TYPECHECK: "1", DATABASE_URL: "" } : process.env,
  });
  if (r.status !== 0) {
    console.error(`\n✖ gate failed at ${name}${r.signal === "SIGKILL" || r.status === 137 ? " (killed by the OS: likely out of memory, not a code failure)" : ""}`);
    process.exit(r.status ?? 1);
  }
}
console.log("\n✔ gate green");
