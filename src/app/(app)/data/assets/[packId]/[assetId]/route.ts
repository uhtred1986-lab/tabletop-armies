import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dataPacks, packAssets } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { readPrivateBlob, isBlobKey } from "@/lib/blob";

export const dynamic = "force-dynamic";

const imageContentType = /^image\/(?:jpeg|png|webp|avif|gif)$/i;
const commonHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

/** Serves a pack-envelope asset ID, so shared images can be referenced by many units without duplicating storage rows. */
export async function GET(_request: Request, context: { params: Promise<{ packId: string; assetId: string }> }) {
  const owner = await requireOwner();
  if (!owner.ok) return response("Unauthorized", 401);

  const params = await context.params;
  const packId = Number(params.packId);
  if (!Number.isSafeInteger(packId) || packId < 1 || !isSafeAssetId(params.assetId)) return notFound();

  try {
    const [pack] = await db.select().from(dataPacks).where(eq(dataPacks.id, packId)).limit(1);
    if (!pack) return notFound();
    const content = object(pack.content);
    const envelopeAssets = Array.isArray(content.assets) ? content.assets.map(object) : [];
    const envelopeAsset = envelopeAssets.find((asset) => asset.id === params.assetId);
    const blobKey = typeof envelopeAsset?.ref === "string" ? envelopeAsset.ref : "";
    if (!isBlobKey(blobKey)) return notFound();
    const [reference] = await db.select().from(packAssets).where(and(eq(packAssets.packId, packId), eq(packAssets.blobKey, blobKey))).limit(1);
    if (!reference) return notFound();

    const blob = await readPrivateBlob(blobKey);
    if (!blob || blob.statusCode !== 200) return notFound();
    if (!imageContentType.test(blob.blob.contentType)) return response("Unsupported media type", 415);
    return new Response(blob.stream, {
      status: 200,
      headers: {
        ...commonHeaders,
        "Content-Type": blob.blob.contentType,
        "Content-Length": String(blob.blob.size),
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return response("Service unavailable", 503);
  }
}

/** IDs are schema strings and composed packs may prefix them with `packId:`; path separators are never valid. */
function isSafeAssetId(value: string): boolean {
  return value.length > 0 && value.length <= 300 && value !== "." && value !== ".." && !/[\\/\u0000-\u001f\u007f]/.test(value);
}

function notFound() { return response("Not found", 404); }
function response(body: string, status: number) { return new Response(body, { status, headers: commonHeaders }); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
