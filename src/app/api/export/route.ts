import { sql } from "drizzle-orm";
import { db } from "@/db";
import { OWNER_TABLES } from "@/db/schema";
import { requireOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Owner backup. OWNER_TABLES is a compile-time allowlist and excludes every data pack. */
export async function GET() {
  const owner = await requireOwner();
  if (!owner.ok) return Response.json({ error: "unauthorised" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const tables: Record<string, unknown[]> = {};
    for (const table of OWNER_TABLES) {
      const result: unknown = await db.execute(sql.raw("select * from " + table));
      const rows = (result as { rows?: unknown[] }).rows;
      tables[table] = rows ?? result as unknown[];
    }
    const body = JSON.stringify({ format: "tabletop-armies-owner-export", version: 1, exportedAt: new Date().toISOString(), tables });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="tabletop-armies-owner-export.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "export-failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
