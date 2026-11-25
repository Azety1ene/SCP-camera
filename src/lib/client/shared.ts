"use client";

import type { GeneratedReport } from "@/lib/report/schema.ts";

/** 財団データベース(全職員で共有する報告書)のクライアント側 */

export type SharedSummary = {
  id: string;
  itemNumber: string;
  title: string;
  objectClass: string;
  /** 添付画像(/api/shared/[id]/image。職員認証済みの Cookie で読める) */
  imageUrl: string;
  observatory: string | null;
  createdAt: string;
};

export type SharedReport = SharedSummary & { tone: string | null; report: GeneratedReport };

type ApiError = { error: { code: string; message: string } };

export class SharedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new SharedError("network", "財団回線との接続が切断されました。");
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok || !body || body.error) {
    throw new SharedError(body?.error?.code ?? `http_${res.status}`, body?.error?.message ?? "財団データベースに接続できません。");
  }
  return body;
}

/** 新しい順に30件ずつ。続きを読むときは、前の応答の next を渡す */
export async function fetchSharedList(before?: string | null): Promise<{ items: SharedSummary[]; next: string | null }> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return call<{ items: SharedSummary[]; next: string | null }>(`/api/shared${query}`, { cache: "no-store" });
}

export async function fetchShared(id: string): Promise<SharedReport> {
  return (await call<{ item: SharedReport }>(`/api/shared/${encodeURIComponent(id)}`, { cache: "no-store" })).item;
}

/** O5 の削除、または登録した端末の取り下げ(deleteKey を渡す)。すでに無くなっていた場合も成功として扱う */
export async function deleteShared(id: string, deleteKey?: string): Promise<void> {
  try {
    await call(`/api/shared/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: deleteKey ? { "x-delete-key": deleteKey } : undefined,
    });
  } catch (error) {
    if (error instanceof SharedError && (error.code === "not_found" || error.code === "forbidden")) {
      // 権限がないのか、すでに抹消されていたのかを確かめる
      const gone = await fetchShared(id).then(
        () => false,
        (cause) => cause instanceof SharedError && cause.code === "not_found",
      );
      if (gone) return;
    }
    throw error;
  }
}

/** 長い辺を1280pxまでに縮め、WebP にする。ブラウザが WebP に変換できなければ JPEG にする */
export async function toShareImage(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode("image/webp", 0.8);
  // WebP に対応していないブラウザは、黙って PNG を返す
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg", 0.82);
  if (!jpeg) throw new SharedError("encode", "画像を変換できませんでした。");
  return jpeg;
}

/**
 * 報告書を財団データベースに登録し、登録した ID と取り下げ用の鍵を返す。
 * image には、照会のときに送った添付画像(toShareImage の結果)をそのまま渡す。作り直すと指紋が合わず登録できない
 */
export async function shareReport(token: string, image: Blob, observatory: string): Promise<{ id: string; deleteKey: string }> {
  const form = new FormData();
  form.append("token", token);
  form.append("image", image, image.type === "image/webp" ? "attachment.webp" : "attachment.jpg");
  form.append("observatory", observatory);
  const { id, deleteKey } = await call<{ id: string; deleteKey: string }>("/api/shared", { method: "POST", body: form });
  return { id, deleteKey };
}

/** 登録票の有効期限(サーバーの token.ts と同じ) */
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 登録票の中身を、署名は確かめずに読む(画面の案内に使うだけ。確かめるのはサーバー)。
 * legacy は、画像の指紋が入る前に発行された登録票で、登録できない
 */
export function tokenStatus(token: string, now = Date.now()): "ok" | "expired" | "legacy" {
  try {
    const payload = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)));
    const value = JSON.parse(json) as { imageHash?: unknown; issuedAt?: unknown };
    if (typeof value.imageHash !== "string" || typeof value.issuedAt !== "number") return "legacy";
    return now - value.issuedAt > TOKEN_MAX_AGE_MS ? "expired" : "ok";
  } catch {
    return "legacy";
  }
}
