import { cookies } from "next/headers";
import { clientIp, hit, RATE_RULES, tooManyRequests } from "@/lib/server/rate-limit.ts";
import { clearanceForCode, decodeSession, encodeSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session.ts";

/** GET /api/auth  現在のクリアランスを返す(未認証なら null) */
export async function GET() {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  return Response.json({ clearance: session?.clearance ?? null });
}

/**
 * POST /api/auth  { code: string }
 * 職員認証コードを照合し、クリアランスを書き込んだ署名付きCookieを発行する。
 * 総当たりを防ぐため、1つの IP からの照合は回数を制限する(成功も数える)
 */
export async function POST(request: Request) {
  const limited = await hit(RATE_RULES.auth, clientIp(request));
  if (!limited.ok) return tooManyRequests(limited.retryAfter, "認証の試行回数が上限に達しました。");

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.slice(0, 200) : "";
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const clearance = clearanceForCode(code);
  if (!clearance) return Response.json({ ok: false }, { status: 401 });

  (await cookies()).set({
    name: SESSION_COOKIE,
    value: encodeSession({ clearance, issuedAt: Date.now() }),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return Response.json({ ok: true, clearance });
}

/** DELETE /api/auth  ログアウト */
export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
