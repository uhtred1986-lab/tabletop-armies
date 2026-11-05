import "server-only";
import { del, get, head, put } from "@vercel/blob";

const BLOB_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,180}\.(?:jpe?g|png|webp)$/i;

/** Keep blob lookups pathname-only; accepting a client URL here would create an SSRF path. */
export function isBlobKey(value: string): boolean {
  return BLOB_KEY.test(value) && !value.includes("//") && !value.includes("..") && !value.startsWith("/");
}

/** An optional deployment prefix keeps local/private development media out of production namespaces. */
export function withBlobPrefix(pathname: string): string {
  if (!isBlobKey(pathname)) throw new Error("invalid-blob-key");
  const prefix = (process.env.BLOB_PATH_PREFIX || "").replace(/^\/+|\/+$/g, "");
  if (!prefix) return pathname;
  if (!/^[a-zA-Z0-9/_-]{1,100}$/.test(prefix) || prefix.includes("..") || prefix.includes("//")) throw new Error("invalid-blob-prefix");
  return prefix + "/" + pathname;
}

export async function putPrivateBlob(pathname: string, body: Uint8Array, contentType: string) {
  return put(withBlobPrefix(pathname), Buffer.from(body), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
}

export async function readPrivateBlob(pathname: string) {
  if (!isBlobKey(pathname)) throw new Error("invalid-blob-key");
  return get(pathname, { access: "private", useCache: false });
}

/** Check private Blob metadata without opening or downloading its byte stream. */
export async function headPrivateBlob(pathname: string) {
  if (!isBlobKey(pathname)) throw new Error("invalid-blob-key");
  return head(pathname);
}

/** Best-effort cleanup is called only after the database row has been removed. */
export async function deletePrivateBlob(pathname: string): Promise<void> {
  if (!isBlobKey(pathname)) throw new Error("invalid-blob-key");
  await del(pathname);
}
