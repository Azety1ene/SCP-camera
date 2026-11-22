import "server-only";

import { neon } from "@neondatabase/serverless";
import type { GeneratedReport } from "@/lib/report/schema.ts";

/**
 * 財団データベース(全職員で共有する報告書)。本体は Neon(Postgres)、添付画像は Vercel Blob に置く。
 * O5 だけが読める部分は、表示側(JS)で隠す。
 */

export type SharedSummary = {
  id: string;
  itemNumber: string;
  title: string;
  objectClass: string;
  imageUrl: string;
  observatory: string | null;
  createdAt: string;
};

export type SharedReport = SharedSummary & { tone: string | null; report: GeneratedReport };

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が設定されていません");
  return neon(url);
}

let ready: Promise<unknown> | null = null;

/** 初回だけ表を作る(マイグレーションの仕組みを持たないため) */
function ensureTable() {
  ready ??= sql()`
    CREATE TABLE IF NOT EXISTS shared_reports (
      id text PRIMARY KEY,
      item_number text NOT NULL,
      tone text,
      title text NOT NULL,
      object_class text NOT NULL,
      report jsonb NOT NULL,
      image_url text NOT NULL,
      observatory text,
      token_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

type Row = {
  id: string;
  item_number: string;
  tone: string | null;
  title: string;
  object_class: string;
  report?: GeneratedReport;
  image_url: string;
  observatory: string | null;
  created_at: string | Date;
};

const toSummary = (row: Row): SharedSummary => ({
  id: row.id,
  itemNumber: row.item_number,
  title: row.title,
  objectClass: row.object_class,
  imageUrl: row.image_url,
  observatory: row.observatory,
  createdAt: new Date(row.created_at).toISOString(),
});

export async function listShared(limit = 100): Promise<SharedSummary[]> {
  await ensureTable();
  const rows = (await sql()`
    SELECT id, item_number, title, object_class, image_url, observatory, created_at
    FROM shared_reports ORDER BY created_at DESC LIMIT ${limit}`) as Row[];
  return rows.map(toSummary);
}

export async function getShared(id: string): Promise<SharedReport | null> {
  await ensureTable();
  const rows = (await sql()`SELECT * FROM shared_reports WHERE id = ${id}`) as Row[];
  const row = rows[0];
  return row ? { ...toSummary(row), tone: row.tone, report: row.report! } : null;
}

export async function findByTokenHash(hash: string): Promise<string | null> {
  await ensureTable();
  const rows = (await sql()`SELECT id FROM shared_reports WHERE token_hash = ${hash}`) as { id: string }[];
  return rows[0]?.id ?? null;
}

export async function insertShared(entry: {
  id: string;
  itemNumber: string;
  tone: string;
  report: GeneratedReport;
  imageUrl: string;
  observatory: string | null;
  tokenHash: string;
}): Promise<void> {
  await ensureTable();
  await sql()`
    INSERT INTO shared_reports (id, item_number, tone, title, object_class, report, image_url, observatory, token_hash)
    VALUES (${entry.id}, ${entry.itemNumber}, ${entry.tone}, ${entry.report.title}, ${entry.report.objectClass},
            ${JSON.stringify(entry.report)}::jsonb, ${entry.imageUrl}, ${entry.observatory}, ${entry.tokenHash})`;
}

/** 削除した行の画像URLを返す(画像も消すため) */
export async function deleteShared(id: string): Promise<string | null> {
  await ensureTable();
  const rows = (await sql()`DELETE FROM shared_reports WHERE id = ${id} RETURNING image_url`) as { image_url: string }[];
  return rows[0]?.image_url ?? null;
}
