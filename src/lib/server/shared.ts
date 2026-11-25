import "server-only";

import type { GeneratedReport } from "@/lib/report/schema.ts";
import { ensureSchema, sql } from "./db.ts";

/**
 * 財団データベース(全職員で共有する報告書)。本体は Neon(Postgres)、添付画像は Vercel Blob に置く。
 * O5 だけが読める部分は、表示側(JS)で隠す。
 * 添付画像の Blob の URL は利用者に渡さず、認証を確かめる /api/shared/[id]/image から配信する。
 */

export type SharedSummary = {
  id: string;
  itemNumber: string;
  title: string;
  objectClass: string;
  /** 添付画像の配信元(このサイトの API) */
  imageUrl: string;
  observatory: string | null;
  createdAt: string;
};

export type SharedReport = SharedSummary & { tone: string | null; report: GeneratedReport };

export type BlobAccess = "public" | "private";

type Row = {
  id: string;
  item_number: string;
  tone: string | null;
  title: string;
  object_class: string;
  report?: GeneratedReport;
  observatory: string | null;
  created_at: string | Date;
};

export const sharedImagePath = (id: string) => `/api/shared/${id}/image`;

const toSummary = (row: Row): SharedSummary => ({
  id: row.id,
  itemNumber: row.item_number,
  title: row.title,
  objectClass: row.object_class,
  imageUrl: sharedImagePath(row.id),
  observatory: row.observatory,
  createdAt: new Date(row.created_at).toISOString(),
});

/** 一覧の続きを読むための目印(最後の行の作成日時と ID) */
export type SharedCursor = { createdAt: string; id: string };

export function encodeCursor(cursor: SharedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(value: string | null): SharedCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as SharedCursor;
    if (typeof parsed.id !== "string" || Number.isNaN(Date.parse(parsed.createdAt))) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 新しい順に limit 件。続きがあれば next を返す */
export async function listShared(limit = 30, before: SharedCursor | null = null): Promise<{ items: SharedSummary[]; next: string | null }> {
  await ensureSchema();
  const rows = (
    before
      ? await sql()`
          SELECT id, item_number, title, object_class, observatory, created_at
          FROM shared_reports
          WHERE (created_at, id) < (${before.createdAt}::timestamptz, ${before.id})
          ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`
      : await sql()`
          SELECT id, item_number, title, object_class, observatory, created_at
          FROM shared_reports ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`
  ) as Row[];
  const page = rows.slice(0, limit).map(toSummary);
  const last = page.at(-1);
  return { items: page, next: rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null };
}

export async function getShared(id: string): Promise<SharedReport | null> {
  await ensureSchema();
  const rows = (await sql()`SELECT * FROM shared_reports WHERE id = ${id}`) as Row[];
  const row = rows[0];
  return row ? { ...toSummary(row), tone: row.tone, report: row.report! } : null;
}

/** 添付画像の Blob の URL と置き場所(配信用。利用者には渡さない) */
export async function getSharedImage(id: string): Promise<{ url: string; access: BlobAccess } | null> {
  await ensureSchema();
  const rows = (await sql()`SELECT image_url, image_access FROM shared_reports WHERE id = ${id}`) as {
    image_url: string;
    image_access: string;
  }[];
  const row = rows[0];
  return row ? { url: row.image_url, access: row.image_access === "private" ? "private" : "public" } : null;
}

export async function findByTokenHash(hash: string): Promise<string | null> {
  await ensureSchema();
  const rows = (await sql()`SELECT id FROM shared_reports WHERE token_hash = ${hash}`) as { id: string }[];
  return rows[0]?.id ?? null;
}

/** 登録されている番号のうち、候補と重なるもの(アイテム番号の重複を避けるため) */
export async function takenItemNumbers(candidates: string[]): Promise<Set<string>> {
  await ensureSchema();
  const rows = (await sql()`SELECT DISTINCT item_number FROM shared_reports WHERE item_number = ANY(${candidates})`) as {
    item_number: string;
  }[];
  return new Set(rows.map((row) => row.item_number));
}

/**
 * 登録する。同じ登録票がすでに登録されていたら(同時に送られた場合も含む)、何もせず false を返す
 */
export async function insertShared(entry: {
  id: string;
  itemNumber: string;
  tone: string;
  report: GeneratedReport;
  imageUrl: string;
  imageAccess: BlobAccess;
  observatory: string | null;
  tokenHash: string;
  deleteKeyHash: string;
}): Promise<boolean> {
  await ensureSchema();
  const rows = (await sql()`
    INSERT INTO shared_reports (id, item_number, tone, title, object_class, report, image_url, image_access, observatory, token_hash, delete_key_hash)
    VALUES (${entry.id}, ${entry.itemNumber}, ${entry.tone}, ${entry.report.title}, ${entry.report.objectClass},
            ${JSON.stringify(entry.report)}::jsonb, ${entry.imageUrl}, ${entry.imageAccess}, ${entry.observatory}, ${entry.tokenHash}, ${entry.deleteKeyHash})
    ON CONFLICT (token_hash) DO NOTHING
    RETURNING id`) as { id: string }[];
  return rows.length > 0;
}

/** 同じ報告書がもう一度登録されたとき(登録票を持つ端末から)、取り下げ用の鍵を作り直す */
export async function rotateDeleteKey(id: string, deleteKeyHash: string): Promise<void> {
  await ensureSchema();
  await sql()`UPDATE shared_reports SET delete_key_hash = ${deleteKeyHash} WHERE id = ${id}`;
}

/**
 * 削除した行の画像を返す(画像も消すため)。該当しなければ null。
 * deleteKeyHash を渡したときは、その鍵で登録したものだけを消す(O5 は渡さずに何でも消せる)
 */
export async function deleteShared(id: string, deleteKeyHash?: string): Promise<{ url: string; access: BlobAccess } | null> {
  await ensureSchema();
  const rows = (
    deleteKeyHash
      ? await sql()`DELETE FROM shared_reports WHERE id = ${id} AND delete_key_hash = ${deleteKeyHash} RETURNING image_url, image_access`
      : await sql()`DELETE FROM shared_reports WHERE id = ${id} RETURNING image_url, image_access`
  ) as { image_url: string; image_access: string }[];
  const row = rows[0];
  return row ? { url: row.image_url, access: row.image_access === "private" ? "private" : "public" } : null;
}
