import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { isBlobKey, readPrivateBlob } from "@/lib/blob";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (!owner.ok) return new Response(null, { status: 401 });
  const { id: idValue } = await context.params;
  const id = Number(idValue);
  if (!Number.isSafeInteger(id) || id < 1) return new Response(null, { status: 404 });
  try {
    const [photo] = await db.select({ blobKey: photos.blobKey, contentType: photos.contentType, byteSize: photos.byteSize })
      .from(photos).where(eq(photos.id, id)).limit(1);
    if (!photo || !isBlobKey(photo.blobKey)) return new Response(null, { status: 404 });
    const blob = await readPrivateBlob(photo.blobKey);
    if (!blob || blob.statusCode !== 200 || blob.blob.size !== photo.byteSize || blob.blob.contentType !== photo.contentType) {
      return new Response(null, { status: 404 });
    }
    return new Response(blob.stream, {
      status: 200,
      headers: {
        "Content-Type": photo.contentType,
        "Content-Length": String(photo.byteSize),
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
