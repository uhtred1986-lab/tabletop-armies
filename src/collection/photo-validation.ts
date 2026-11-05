export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];

export function isValidPhotoPayload(contentType: string, bytes: Uint8Array, reportedSize = bytes.byteLength): contentType is PhotoContentType {
  if (!PHOTO_CONTENT_TYPES.includes(contentType as PhotoContentType) || bytes.byteLength < 1 ||
    bytes.byteLength > MAX_PHOTO_BYTES || bytes.byteLength !== reportedSize) return false;
  if (contentType === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.length > 8 && bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (contentType === "image/webp") return bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}
