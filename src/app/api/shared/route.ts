import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { cookies } from "next/headers";
import { reportSchema } from "@/lib/report/schema.ts";
import { tokenHash, verifyReport } from "@/lib/report/token.ts";
import { findByTokenHash, insertShared, listShared } from "@/lib/server/shared.ts";
import { decodeSession, SESSION_COOKIE } from "@/lib/session.ts";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg" };

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

async function session() {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** GET /api/shared  財団データベースの一覧(新しい順) */
export async function GET() {
  if (!(await session())) return errorResponse(401, "unauthorized", "職員認証が必要です。");
  try {
    return Response.json({ items: await listShared() });
  } catch (error) {
    console.error("[shared] list failed:", error);
    return errorResponse(503, "db", "財団データベースに接続できません。");
  }
}

/**
 * POST /api/shared  報告書を財団データベースに登録する。
 * multipart/form-data: token(照会時に受け取った登録票), image(添付画像。WebP か JPEG), observatory(観測所番号)
 */
export async function POST(request: Request) {
  if (!(await session())) return errorResponse(401, "unauthorized", "職員認証が必要です。");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "bad_request", "登録内容を受け取れませんでした。");
  }
  const token = form.get("token");
  const image = form.get("image");
  const observatoryRaw = form.get("observatory");

  const signed = typeof token === "string" ? verifyReport(token) : null;
  if (!signed || !reportSchema.safeParse(signed.report).success) {
    return errorResponse(400, "invalid_token", "この報告書は登録できません。照会記録を確認できませんでした。");
  }
  if (!(image instanceof File) || !IMAGE_TYPES[image.type]) return errorResponse(415, "unsupported_type", "対応していない画像形式です。");
  if (image.size > MAX_IMAGE_BYTES) return errorResponse(413, "too_large", "画像が大きすぎます。");
  const observatory = typeof observatoryRaw === "string" && /^81-OP-[0-9A-Za-z]{1,8}$/.test(observatoryRaw) ? observatoryRaw : null;

  const hash = tokenHash(token as string);
  try {
    const existing = await findByTokenHash(hash);
    if (existing) return Response.json({ id: existing, duplicate: true });

    const id = randomUUID();
    // 写真は一度保存したら変わらないので、長くキャッシュさせる(Blob の読み出し回数を抑える)
    const blob = await put(`shared/${id}.${IMAGE_TYPES[image.type]}`, image, {
      access: "public",
      addRandomSuffix: true,
      contentType: image.type,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    try {
      await insertShared({ id, itemNumber: signed.itemNumber, tone: signed.tone, report: signed.report, imageUrl: blob.url, observatory, tokenHash: hash });
    } catch (error) {
      await del(blob.url).catch(() => {});
      throw error;
    }
    return Response.json({ id });
  } catch (error) {
    console.error("[shared] insert failed:", error);
    return errorResponse(503, "db", "財団データベースに接続できません。");
  }
}
