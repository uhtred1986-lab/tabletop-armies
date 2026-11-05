/**
 * Which database the app talks to. Pure, so `npm test` can check it without a connection; `./index.ts` is the only caller.
 *
 * - `DB_DRIVER=neon-ws` and a `DATABASE_URL`: Neon over WebSockets (cloud sessions, where raw TCP 5432 is blocked).
 * - `DATABASE_URL` alone: postgres.js (Vercel, a laptop, a local Postgres).
 * - Neither: `none`, and the first query throws. There is no mock that pretends a write happened.
 */
export type DbTarget = { kind: "neon-ws"; url: string } | { kind: "postgres"; url: string } | { kind: "none" };

export const NO_DATABASE_MESSAGE =
  "No database configured. Set DATABASE_URL (the Neon connection string) in .env.local — docs/architecture/platform.md.";

export function resolveDbTarget(env: Record<string, string | undefined>): DbTarget {
  const url = env.DATABASE_URL?.trim();
  if (!url) return { kind: "none" };
  if (env.DB_DRIVER?.trim() === "neon-ws") return { kind: "neon-ws", url };
  return { kind: "postgres", url };
}

/** A handle that throws on any use: what `db` is when no database is configured. */
export function refusingHandle<T extends object>(): T {
  return new Proxy({} as T, {
    get() {
      throw new Error(NO_DATABASE_MESSAGE);
    },
  });
}
