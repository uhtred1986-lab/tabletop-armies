import { eq } from "drizzle-orm";
import { db } from "@/db";
import { packAssets } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { isBlobKey, readPrivateBlob } from "@/lib/blob";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (!owner.ok) return new Response(null, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return new Response(null, { status: 404 });
  try {
    const [asset] = await db.select({ blobKey: packAssets.blobKey, kind: packAssets.kind }).from(packAssets).where(eq(packAssets.id, id)).limit(1);
    if (!asset || !isBlobKey(asset.blobKey) || !["card", "token", "model_reference"].includes(asset.kind)) return new Response(null, { status: 404 });
    const blob = await readPrivateBlob(asset.blobKey);
    if (!blob || blob.statusCode !== 200) return new Response(null, { status: 404 });
    if (!/^image\/(?:jpeg|png|webp|avif|gif)$/i.test(blob.blob.contentType)) return new Response(null, { status: 415 });
    return new Response(blob.stream, {
      status: 200,
      headers: {
        "Content-Type": blob.blob.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
