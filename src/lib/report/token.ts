import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { GeneratedReport } from "@/lib/report/schema.ts";

/**
 * 照会で生成した報告書に付ける署名(登録票)。
 * 財団データベースに登録するとき、この署名が正しい報告書だけを受け付ける。
 * 合言葉を知っている人が、生成していない文章を登録できないようにするため。
 * 値: base64url(JSON) + "." + base64url(HMAC-SHA256)
 */

export type SignedReport = { itemNumber: string; tone: string; report: GeneratedReport; issuedAt: number };

function key(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET が設定されていないか、短すぎます");
  return value;
}

// セッションの署名と取り違えないよう、用途の名前を混ぜる
const sign = (payload: string) => createHmac("sha256", key()).update(`report:${payload}`).digest("base64url");

export function signReport(value: Omit<SignedReport, "issuedAt">): string {
  const payload = Buffer.from(JSON.stringify({ ...value, issuedAt: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyReport(token: string): SignedReport | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as SignedReport;
  } catch {
    return null;
  }
}

/** 同じ報告書を二重に登録しないための指紋 */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
