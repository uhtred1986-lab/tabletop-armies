import { describe, expect, it } from "vitest";
import { backupBranchName, branchesToPrune, classifyBuild, endpointIdOf, migrationState, planProduction } from "./deploy-plan.mts";

const journal = [
  { idx: 0, when: 100, tag: "0000_init" },
  { idx: 1, when: 200, tag: "0001_next" },
];

describe("deploy plan", () => {
  it("touches no database outside Vercel", () => {
    expect(classifyBuild({}).kind).toBe("local");
  });

  it("never migrates a preview that shares production's endpoint", () => {
    const url = "postgres://u@ep-cool-1-pooler.eu-central-1.aws.neon.tech/db";
    expect(classifyBuild({ VERCEL_ENV: "preview", DATABASE_URL: url, PRODUCTION_DATABASE_HOST: "ep-cool-1.eu-central-1.aws.neon.tech" }).kind).toBe("preview-shared-db");
    expect(classifyBuild({ VERCEL_ENV: "preview", DATABASE_URL: url }).kind).toBe("preview-shared-db");
    expect(endpointIdOf(url)).toBe("ep-cool-1");
  });

  it("finds pending migrations, including the first one on an empty database", () => {
    expect(migrationState(journal, []).pending.map((e) => e.tag)).toEqual(["0000_init", "0001_next"]);
    expect(migrationState(journal, [{ created_at: 100 }]).pending.map((e) => e.tag)).toEqual(["0001_next"]);
    expect(migrationState(journal, [{ created_at: 100 }, { created_at: 200 }]).pending).toEqual([]);
  });

  it("refuses to migrate production without the Neon credentials for a backup", () => {
    const state = migrationState(journal, [{ created_at: 100 }]);
    expect(planProduction({}, state, new Date()).action).toBe("refuse");
    const plan = planProduction({ NEON_API_KEY: "k", NEON_PROJECT_ID: "p" }, state, new Date("2026-11-05T10:00:00Z"));
    expect(plan).toMatchObject({ action: "backup-then-migrate", branchName: "pre-migrate-20261105T100000Z-0001_next" });
    expect(planProduction({}, migrationState(journal, [{ created_at: 100 }, { created_at: 200 }]), new Date()).action).toBe("build");
  });

  it("prunes only old pre-migrate branches", () => {
    const branches = [
      { name: "production", created_at: "2026-01-01" },
      { name: "pre-migrate-a", created_at: "2026-01-01" },
      { name: "pre-migrate-b", created_at: "2026-02-01" },
      { name: "pre-migrate-c", created_at: "2026-03-01" },
    ];
    expect(branchesToPrune(branches).map((b) => b.name)).toEqual(["pre-migrate-a"]);
    expect(backupBranchName(new Date("2026-11-05T10:00:00Z"), "0000_init")).toBe("pre-migrate-20261105T100000Z-0000_init");
  });
});
