import "server-only";

import { createHash } from "node:crypto";

/**
 * 受け取った画像の検証。クライアントが申告する Content-Type は信用せず、先頭のバイト列(マジックバイト)で形式を確かめる。
 */

export type ImageKind = "image/jpeg" | "image/png" | "image/webp";

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export type ImageCheck =
  | { ok: true; bytes: Buffer; type: ImageKind }
  | { ok: false; status: 413 | 415; code: "too_large" | "unsupported_type" };

/** 申告された形式と中身が一致し、許可した形式で、大きさが上限以内かを確かめる */
export async function readImage(file: File, allowed: readonly ImageKind[], maxBytes: number): Promise<ImageCheck> {
  if (file.size > maxBytes) return { ok: false, status: 413, code: "too_large" };
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type || !allowed.includes(type) || (file.type && file.type !== type)) {
    return { ok: false, status: 415, code: "unsupported_type" };
  }
  return { ok: true, bytes, type };
}

/** 添付画像の指紋。登録票に入れ、登録時に同じ画像かを確かめる */
export function imageHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("base64url");
}
