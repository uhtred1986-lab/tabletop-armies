import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import postgres from "postgres";
import * as schema from "./schema";
import { refusingHandle, resolveDbTarget } from "./target";

/**
 * The one database handle (CLAUDE.md rule 6). Cached on globalThis so `next dev` hot reloads reuse one pool instead of
 * opening a new one per edit. Server-only: imported by Server Components, Server Functions and route handlers.
 */
type Db = PostgresJsDatabase<typeof schema>;
const cache = globalThis as unknown as { __musterDb?: Db };

function open(): Db {
  const target = resolveDbTarget(process.env);
  if (target.kind === "none") return refusingHandle<Db>();
  if (target.kind === "neon-ws") {
    neonConfig.webSocketConstructor = globalThis.WebSocket;
    const pool = new Pool({ connectionString: target.url, max: 5 });
    // Neon drops idle WebSockets; without a listener that is an uncaught exception. The pool replaces the client.
    pool.on("error", (error: Error) => console.warn("neon-ws pool: idle client dropped:", error.message));
    return drizzleNeon(pool, { schema }) as unknown as Db;
  }
  const sql = postgres(target.url, { max: 5, prepare: !target.url.includes("-pooler"), onnotice: () => {} });
  return drizzle(sql, { schema });
}

export const db: Db = cache.__musterDb ?? (cache.__musterDb = open());
export { schema };
