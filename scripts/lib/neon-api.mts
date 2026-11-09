/**
 * The Neon API for this app's scripts. Defaults to the tabletop-armies project and checks its name before any call,
 * because cloud sessions can carry another app's NEON_PROJECT_ID (Gullet Cove); that variable is deliberately not read.
 */
export const PROJECT = process.env.TMP_BRANCH_PROJECT?.trim() || "long-mountain-10123121";
const API = "https://console.neon.tech/api/v2";

export async function neon(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const key = process.env.NEON_API_KEY?.trim();
  if (!key) throw new Error("NEON_API_KEY is not set");
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", ...init.headers } });
  const body = await res.text();
  if (!res.ok) throw new Error(`Neon ${init.method ?? "GET"} ${path}: HTTP ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) as Record<string, unknown> : {};
}

export async function assertOwnProject(): Promise<void> {
  const { project } = await neon(`/projects/${PROJECT}`) as { project: { name: string } };
  if (project.name !== "tabletop-armies") throw new Error(`Project ${PROJECT} is "${project.name}", not tabletop-armies; refusing`);
}

export interface Branch { id: string; name: string; default?: boolean }
export async function branches(): Promise<Branch[]> {
  return (await neon(`/projects/${PROJECT}/branches`) as { branches: Branch[] }).branches;
}

/** The pooled connection string of a branch. Never print it. */
export async function connectionUri(branchId: string): Promise<string> {
  const { uri } = await neon(`/projects/${PROJECT}/connection_uri?branch_id=${branchId}&database_name=muster&role_name=muster_owner&pooled=true`) as { uri: string };
  return uri;
}
