import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { GeneratedReport } from "@/lib/report/schema.ts";

/**
 * 照会で生成した報告書に付ける署名(登録票)。
 * 財団データベースに登録するとき、この署名が正しい報告書だけを受け付ける。
 * 合言葉を知っている人が、生成していない文章や、照会したものと別の画像を登録できないようにするため。
 * 値: base64url(JSON) + "." + base64url(HMAC-SHA256)
 */

export type SignedReport = {
  itemNumber: string;
  tone: string;
  report: GeneratedReport;
  /** 登録時に添付する画像(加工・縮小済み)の SHA-256。照会のときに受け取った画像から計算する */
  imageHash: string;
  issuedAt: number;
};

/** 登録票の有効期限。照会のあと、この期間内なら後からでも登録できる */
export const REPORT_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function key(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET が設定されていないか、短すぎます");
  return value;
}

// セッションの署名と取り違えないよう、用途の名前を混ぜる
const sign = (payload: string) => createHmac("sha256", key()).update(`report:${payload}`).digest("base64url");

export function signReport(value: Omit<SignedReport, "issuedAt">, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...value, issuedAt: now })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export type VerifyFailure = "invalid" | "expired";

export function verifyReport(token: string, now = Date.now()): { ok: true; value: SignedReport } | { ok: false; reason: VerifyFailure } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid" };
  const [payload, signature] = parts;
  if (!payload || !signature) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: "invalid" };
  let value: SignedReport;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString()) as SignedReport;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  // 画像の指紋がない登録票は、この仕組みを入れる前に発行されたもの。すり替えを防げないので受け付けない
  if (typeof value.imageHash !== "string" || !value.imageHash || typeof value.issuedAt !== "number") {
    return { ok: false, reason: "invalid" };
  }
  if (now - value.issuedAt > REPORT_TOKEN_MAX_AGE_MS || value.issuedAt - now > 60_000) return { ok: false, reason: "expired" };
  return { ok: true, value };
}

/** 登録した端末が後から取り下げるための鍵。端末にだけ渡し、DB にはハッシュを置く */
export function newDeleteKey(): string {
  return randomBytes(24).toString("base64url");
}

/** 同じ報告書を二重に登録しないための指紋(取り下げ用の鍵のハッシュにも使う) */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
