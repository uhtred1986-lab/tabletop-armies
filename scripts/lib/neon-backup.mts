/**
 * The pre-migration backup (#195): a Neon branch of production, made through
 * Neon's API just before a production build migrates.
 *
 * A Neon branch is a copy-on-write snapshot of its parent at the moment it is
 * created — instant, whatever the database's size, and it lives in Neon rather
 * than in the repo or on a laptop. It is created without a compute endpoint, so
 * it costs storage for what changes after it and nothing else. Restoring is
 * Neon's own "reset from parent" / "restore" in the console, or pointing
 * DATABASE_URL at the branch (after adding a compute to it).
 *
 * The free plan's branch limit is tight, so after a successful migration only
 * the newest two `pre-migrate-*` branches are kept (`pruneBackupBranches`).
 *
 * `fetch` and `sleep` are parameters so `scripts/verify-deploy.mts` can drive
 * every path with a fake Neon; the build passes the real ones.
 */
import { BACKUP_PREFIX, BACKUPS_KEPT, branchesToPrune, endpointIdOf } from "./deploy-plan.mts";

export type NeonDeps = {
  apiKey: string;
  projectId: string;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** How long to wait for Neon's create-branch operations before giving up. */
  timeoutMs?: number;
};

const API = "https://console.neon.tech/api/v2";

type Operation = { id: string; status: string };

async function call<T>(deps: NeonDeps, method: string, path: string, body?: unknown): Promise<T> {
  const response = await deps.fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${deps.apiKey}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new NeonApiError(`Neon API ${method} ${path} answered ${response.status}: ${text.slice(0, 300)}`, response.status, text);
  }
  return (await response.json()) as T;
}

class NeonApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message);
  }
}

/** Neon refuses a new branch at the plan's limit with a 4xx whose text names the limit. */
function isBranchLimit(error: unknown): boolean {
  return (
    error instanceof NeonApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    /limit|quota|exceed/i.test(error.body)
  );
}

/**
 * Finds the branch behind `databaseUrl` (by its endpoint id, so pooled and
 * direct URLs both work), branches it as `branchName`, and waits until Neon
 * reports the branch finished. Throws on anything else — the caller treats a
 * throw as "no backup, so no migration".
 */
export async function createBackupBranch(
  deps: NeonDeps,
  databaseUrl: string,
  branchName: string,
): Promise<{ branchId: string; parentId: string }> {
  const endpointId = endpointIdOf(databaseUrl);
  if (!endpointId) throw new Error("DATABASE_URL has no host to look up in Neon.");

  const project = encodeURIComponent(deps.projectId);
  const { endpoints } = await call<{ endpoints: { id: string; branch_id: string }[] }>(
    deps,
    "GET",
    `/projects/${project}/endpoints`,
  );
  const endpoint = endpoints.find((candidate) => candidate.id === endpointId);
  if (!endpoint) {
    throw new Error(
      `Neon project ${deps.projectId} has no endpoint ${endpointId} (the host in DATABASE_URL). Is NEON_PROJECT_ID the production project?`,
    );
  }

  let created: { branch: { id: string }; operations?: Operation[] };
  try {
    created = await call(deps, "POST", `/projects/${project}/branches`, {
      branch: { parent_id: endpoint.branch_id, name: branchName },
    });
  } catch (error) {
    if (!isBranchLimit(error)) throw error;
    throw new Error(
      `Neon's branch limit is reached, so no backup branch could be made. Delete old branches in the Neon console ` +
        `(Branches: the oldest "${BACKUP_PREFIX}*" first, or leftover preview/test branches), then redeploy. (${(error as Error).message})`,
    );
  }

  const deadline = Date.now() + (deps.timeoutMs ?? 60_000);
  for (const first of created.operations ?? []) {
    let operation = first;
    while (operation.status !== "finished" && operation.status !== "skipped") {
      if (["failed", "error", "cancelled", "cancelling"].includes(operation.status)) {
        throw new Error(`Neon operation ${operation.id} for backup branch ${branchName} ended as "${operation.status}".`);
      }
      if (Date.now() > deadline) {
        throw new Error(`Neon operation ${operation.id} for backup branch ${branchName} did not finish in time.`);
      }
      await deps.sleep(1000);
      ({ operation } = await call<{ operation: Operation }>(
        deps,
        "GET",
        `/projects/${project}/operations/${encodeURIComponent(operation.id)}`,
      ));
    }
  }

  return { branchId: created.branch.id, parentId: endpoint.branch_id };
}

type BranchRow = { id: string; name: string; created_at?: string };

/**
 * Retention, after a successful migration: deletes every `pre-migrate-*`
 * branch but the newest `keep` (see `branchesToPrune`). Never throws — a
 * failed cleanup is returned for the build to log as a warning, because the
 * migration it follows has already succeeded.
 */
export async function pruneBackupBranches(
  deps: NeonDeps,
  keep = BACKUPS_KEPT,
): Promise<{ deleted: string[]; failures: string[] }> {
  const project = encodeURIComponent(deps.projectId);
  const deleted: string[] = [];
  const failures: string[] = [];
  let branches: BranchRow[];
  try {
    ({ branches } = await call<{ branches: BranchRow[] }>(deps, "GET", `/projects/${project}/branches`));
  } catch (error) {
    return { deleted, failures: [`listing branches: ${(error as Error).message}`] };
  }
  for (const branch of branchesToPrune(branches, keep)) {
    try {
      await call(deps, "DELETE", `/projects/${project}/branches/${encodeURIComponent(branch.id)}`);
      deleted.push(branch.name);
    } catch (error) {
      failures.push(`${branch.name}: ${(error as Error).message}`);
    }
  }
  return { deleted, failures };
}
