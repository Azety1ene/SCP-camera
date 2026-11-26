import "server-only";

import { del, get, put } from "@vercel/blob";
import type { BlobAccess } from "./shared.ts";

/**
 * 財団データベースの添付画像(Vercel Blob)。
 * private のストア(SCP_CAMERA_READ_WRITE_TOKEN)に置き、/api/shared/[id]/image から認証を確かめて配信する。
 */

/** 未認証では読めない、private のストアに置く */
export const UPLOAD_ACCESS: BlobAccess = "private";

function token(): string {
  // Vercel でストアを接続したときの名前(SCP_CAMERA_)。以前の説明にあった SCP_CAMERA_IMAGE_ の名前でも読めるようにしておく
  const value = process.env.SCP_CAMERA_READ_WRITE_TOKEN || process.env.SCP_CAMERA_IMAGE_READ_WRITE_TOKEN;
  if (!value) throw new Error("SCP_CAMERA_READ_WRITE_TOKEN が設定されていません");
  return value;
}

export async function uploadSharedImage(pathname: string, bytes: Buffer, contentType: string) {
  return put(pathname, bytes, { access: UPLOAD_ACCESS, addRandomSuffix: true, contentType, token: token() });
}

export async function readSharedImage(url: string, access: BlobAccess, ifNoneMatch?: string) {
  return get(url, { access, ifNoneMatch, token: token() });
}

export async function deleteSharedImage(url: string, access: BlobAccess) {
  void access;
  await del(url, { token: token() });
}
