import "server-only";

import { createHmac } from "node:crypto";
import { ensureSchema, hasDatabase, sql } from "./db.ts";

/**
 * レート制限。Neon の表で、決まった時間枠ごとの回数を数える(固定窓)。
 * DB が設定されていない・つながらないときは制限せずに通す(開発環境と障害時に画面が止まらないように)。
 */

export type RateRule = {
  /** 何を数えるか(例: "auth") */
  name: string;
  /** 時間枠の長さ(秒) */
  windowSeconds: number;
  /** 時間枠の中で許す回数 */
  limit: number;
};

export const RATE_RULES = {
  /** 合言葉の照合: 1つの IP から10分に10回まで */
  auth: { name: "auth", windowSeconds: 10 * 60, limit: 10 },
  /** 照会(報告書の生成): 1つの IP から1時間に20回まで */
  generate: { name: "generate", windowSeconds: 60 * 60, limit: 20 },
  /** 財団データベースへの登録: 1つの IP から1日に30回まで */
  share: { name: "share", windowSeconds: 24 * 60 * 60, limit: 30 },
} satisfies Record<string, RateRule>;

/** Gemini で生成する回数の、全体での1日の上限(API キーの枠を使い切らないため) */
export function dailyGenerateLimit(): number {
  const value = Number(process.env.GENERATE_DAILY_LIMIT);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 300;
}

export type RateResult = { ok: true } | { ok: false; retryAfter: number };

/** 呼び出し元の IP。Vercel では x-forwarded-for の先頭に、Vercel が確かめた接続元が入る */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** 1回数えて、上限を超えていないかを返す */
export async function hit(rule: RateRule, subject: string, now = Date.now()): Promise<RateResult> {
  if (!hasDatabase()) return { ok: true };
  const windowMs = rule.windowSeconds * 1000;
  const start = new Date(Math.floor(now / windowMs) * windowMs);
  // IP アドレスをそのまま残さないよう、鍵付きのハッシュにして数える
  const digest = createHmac("sha256", process.env.SESSION_SECRET ?? "scp-camera").update(subject).digest("base64url").slice(0, 22);
  const bucket = `${rule.name}:${digest}`;
  try {
    await ensureSchema();
    const rows = (await sql()`
      INSERT INTO rate_limits (bucket, window_start, count) VALUES (${bucket}, ${start.toISOString()}, 1)
      ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count`) as { count: number }[];
    // 古い枠は、ときどき掃除する
    if (Math.random() < 0.02) {
      sql()`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`.catch(() => {});
    }
    const count = rows[0]?.count ?? 0;
    if (count > rule.limit) return { ok: false, retryAfter: Math.ceil((start.getTime() + windowMs - now) / 1000) };
    return { ok: true };
  } catch (error) {
    console.error("[rate-limit] 回数を数えられませんでした(制限せずに通します):", error);
    return { ok: true };
  }
}

export function tooManyRequests(retryAfter: number, message: string): Response {
  return Response.json(
    { ok: false, error: { code: "rate_limited", message } },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } },
  );
}
