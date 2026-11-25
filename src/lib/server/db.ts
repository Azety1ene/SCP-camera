import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon(Postgres)への接続。接続の関数は1つを使い回す。
 * マイグレーションの仕組みを持たないため、表は最初のクエリの前に1回だけ用意する(インスタンスごとに1往復)。
 */

let client: NeonQueryFunction<false, false> | null = null;

export function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}

export function sql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL が設定されていません");
    client = neon(url);
  }
  return client;
}

let ready: Promise<unknown> | null = null;

export function ensureSchema(): Promise<unknown> {
  if (!ready) {
    const q = sql();
    ready = q
      .transaction([
        q`CREATE TABLE IF NOT EXISTS shared_reports (
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
          )`,
        // 登録した端末が後から取り下げるための鍵(のハッシュ)
        q`ALTER TABLE shared_reports ADD COLUMN IF NOT EXISTS delete_key_hash text`,
        // 添付画像の置き場所(いまはすべて private)
        q`ALTER TABLE shared_reports ADD COLUMN IF NOT EXISTS image_access text NOT NULL DEFAULT 'public'`,
        q`CREATE INDEX IF NOT EXISTS shared_reports_created_at_idx ON shared_reports (created_at DESC, id DESC)`,
        q`CREATE INDEX IF NOT EXISTS shared_reports_item_number_idx ON shared_reports (item_number)`,
        // レート制限の回数(rate-limit.ts)
        q`CREATE TABLE IF NOT EXISTS rate_limits (
            bucket text NOT NULL,
            window_start timestamptz NOT NULL,
            count integer NOT NULL DEFAULT 0,
            PRIMARY KEY (bucket, window_start)
          )`,
      ])
      .catch((error) => {
        ready = null;
        throw error;
      });
  }
  return ready;
}
