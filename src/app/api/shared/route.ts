import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { reportSchema } from "@/lib/report/schema.ts";
import { newDeleteKey, tokenHash, verifyReport } from "@/lib/report/token.ts";
import { deleteSharedImage, UPLOAD_ACCESS, uploadSharedImage } from "@/lib/server/blob.ts";
import { imageHash, readImage } from "@/lib/server/image.ts";
import { clientIp, hit, RATE_RULES, tooManyRequests } from "@/lib/server/rate-limit.ts";
import { decodeCursor, findByTokenHash, insertShared, listShared, rotateDeleteKey } from "@/lib/server/shared.ts";
import { decodeSession, SESSION_COOKIE } from "@/lib/session.ts";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const EXTENSIONS = { "image/webp": "webp", "image/jpeg": "jpg" } as const;

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

async function session() {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** GET /api/shared?before=…  財団データベースの一覧(新しい順、30件ずつ) */
export async function GET(request: Request) {
  if (!(await session())) return errorResponse(401, "unauthorized", "職員認証が必要です。");
  const before = decodeCursor(new URL(request.url).searchParams.get("before"));
  try {
    return Response.json(await listShared(30, before));
  } catch (error) {
    console.error("[shared] list failed:", error);
    return errorResponse(503, "db", "財団データベースに接続できません。");
  }
}

/**
 * POST /api/shared  報告書を財団データベースに登録する。
 * multipart/form-data: token(照会時に受け取った登録票), image(照会時に送ったものと同じ添付画像。WebP か JPEG), observatory(観測所番号)
 * 応答: { id, deleteKey }。deleteKey は登録した端末が後から取り下げるときに使う
 */
export async function POST(request: Request) {
  if (!(await session())) return errorResponse(401, "unauthorized", "職員認証が必要です。");

  const limited = await hit(RATE_RULES.share, clientIp(request));
  if (!limited.ok) return tooManyRequests(limited.retryAfter, "登録の申請が多すぎます。時間をおいて再試行してください。");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "bad_request", "登録内容を受け取れませんでした。");
  }
  const token = form.get("token");
  const image = form.get("image");
  const observatoryRaw = form.get("observatory");

  const verified = typeof token === "string" ? verifyReport(token) : null;
  if (verified && !verified.ok && verified.reason === "expired") {
    return errorResponse(400, "token_expired", "登録票の有効期限(照会から30日)が切れているため、登録できません。");
  }
  if (!verified?.ok || !reportSchema.safeParse(verified.value.report).success) {
    return errorResponse(400, "invalid_token", "この報告書は登録できません。照会記録を確認できませんでした。");
  }
  const signed = verified.value;

  if (!(image instanceof File)) return errorResponse(415, "unsupported_type", "対応していない画像形式です。");
  const checked = await readImage(image, ["image/webp", "image/jpeg"], MAX_IMAGE_BYTES);
  if (!checked.ok) {
    return errorResponse(checked.status, checked.code, checked.status === 413 ? "画像が大きすぎます。" : "対応していない画像形式です。");
  }
  // 照会のときに受け取った添付画像と同じものだけを受け付ける(別の画像へのすり替えを防ぐ)
  if (imageHash(checked.bytes) !== signed.imageHash) {
    return errorResponse(400, "image_mismatch", "添付画像が照会記録と一致しません。");
  }
  const observatory = typeof observatoryRaw === "string" && /^81-OP-[0-9A-Za-z]{1,8}$/.test(observatoryRaw) ? observatoryRaw : null;

  const hash = tokenHash(token as string);
  const deleteKey = newDeleteKey();
  try {
    // 登録票を持っているのは照会した端末だけなので、二重登録のときは鍵を作り直して渡す
    const existing = await findByTokenHash(hash);
    if (existing) {
      await rotateDeleteKey(existing, tokenHash(deleteKey));
      return Response.json({ id: existing, deleteKey, duplicate: true });
    }

    const id = randomUUID();
    const blob = await uploadSharedImage(`shared/${id}.${EXTENSIONS[checked.type as keyof typeof EXTENSIONS]}`, checked.bytes, checked.type);
    let inserted = false;
    try {
      inserted = await insertShared({
        id,
        itemNumber: signed.itemNumber,
        tone: signed.tone,
        report: signed.report,
        imageUrl: blob.url,
        imageAccess: UPLOAD_ACCESS,
        observatory,
        tokenHash: hash,
        deleteKeyHash: tokenHash(deleteKey),
      });
    } catch (error) {
      await deleteSharedImage(blob.url, UPLOAD_ACCESS).catch(() => {});
      throw error;
    }
    if (!inserted) {
      // 同時に送られた同じ登録票が、先に登録された
      await deleteSharedImage(blob.url, UPLOAD_ACCESS).catch(() => {});
      const winner = await findByTokenHash(hash);
      if (!winner) throw new Error("登録の競合を解決できませんでした");
      await rotateDeleteKey(winner, tokenHash(deleteKey));
      return Response.json({ id: winner, deleteKey, duplicate: true });
    }
    return Response.json({ id, deleteKey });
  } catch (error) {
    console.error("[shared] insert failed:", error);
    return errorResponse(503, "db", "財団データベースに接続できません。");
  }
}
