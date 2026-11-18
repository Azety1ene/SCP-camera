import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 職員認証のセッション。DBを使わず、クリアランスを書き込んだ値を HMAC で署名して Cookie に入れる。
 * Cookie の値: base64url(JSON) + "." + base64url(HMAC-SHA256)
 */

export type Clearance = "L2" | "O5";

export type Session = { clearance: Clearance; issuedAt: number };

export const SESSION_COOKIE = "scp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30日

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET が設定されていないか、短すぎます");
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined): Session | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (session.clearance !== "L2" && session.clearance !== "O5") return null;
    if (Date.now() - session.issuedAt > SESSION_MAX_AGE * 1000) return null;
    return session;
  } catch {
    return null;
  }
}

/** 入力された職員認証コードから、付与するクリアランスを決める。一致しなければ null */
export function clearanceForCode(code: string): Clearance | null {
  const input = code.trim();
  if (!input) return null;
  const o5 = process.env.ACCESS_CODE_O5?.trim();
  const level2 = process.env.ACCESS_CODE_LEVEL2?.trim();
  if (o5 && safeEqual(input, o5)) return "O5";
  if (level2 && safeEqual(input, level2)) return "L2";
  return null;
}
