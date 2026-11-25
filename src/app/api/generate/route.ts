import { ApiError } from "@google/genai";
import { cookies } from "next/headers";
import { GeminiUnavailableError } from "@/lib/gemini.ts";
import { generateReport, ReportFormatError } from "@/lib/report/generate.ts";
import { isSampleMode, pickSampleReport, renumberSample } from "@/lib/report/samples.ts";
import type { GeneratedReport } from "@/lib/report/schema.ts";
import { signReport } from "@/lib/report/token.ts";
import { imageHash, readImage } from "@/lib/server/image.ts";
import { pickItemNumber } from "@/lib/server/item-number.ts";
import { clientIp, dailyGenerateLimit, hit, RATE_RULES, tooManyRequests } from "@/lib/server/rate-limit.ts";
import { decodeSession, SESSION_COOKIE } from "@/lib/session.ts";

// 生成には数分かかることがあるため、上限を長めにとる(秒)
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * POST /api/generate
 * multipart/form-data:
 * - image      生成に使う撮影画像(JPEG / PNG / WebP)
 * - attachment 財団データベースに登録するときの添付画像(加工・縮小済みの WebP / JPEG)。指紋を登録票に入れる。省略すると登録票は発行しない
 * 職員認証済みのCookieが必要。
 */
export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return errorResponse(401, "unauthorized", "職員認証が必要です。");

  const limited = await hit(RATE_RULES.generate, clientIp(request));
  if (!limited.ok) return tooManyRequests(limited.retryAfter, "照会の申請が多すぎます。時間をおいて再試行してください。");

  let image: File | null = null;
  let attachment: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("image");
    const extra = form.get("attachment");
    image = value instanceof File ? value : null;
    attachment = extra instanceof File ? extra : null;
  } catch {
    return errorResponse(400, "bad_request", "画像を受け取れませんでした。");
  }

  if (!image) return errorResponse(400, "bad_request", "画像が添付されていません。");
  const source = await readImage(image, ["image/jpeg", "image/png", "image/webp"], MAX_IMAGE_BYTES);
  if (!source.ok) return errorResponse(source.status, source.code, source.status === 413 ? "画像が大きすぎます。" : "対応していない画像形式です。");

  let attachmentHash: string | null = null;
  if (attachment) {
    const checked = await readImage(attachment, ["image/webp", "image/jpeg"], MAX_ATTACHMENT_BYTES);
    if (!checked.ok) return errorResponse(checked.status, checked.code, "添付画像を受け付けられませんでした。");
    attachmentHash = imageHash(checked.bytes);
  }

  // 登録票: 財団データベースに登録するときに使う。添付画像の指紋を入れ、別の画像での登録を防ぐ
  const withToken = (body: { itemNumber: string; tone: string; report: GeneratedReport }) =>
    attachmentHash ? { ...body, token: signReport({ ...body, imageHash: attachmentHash }) } : body;

  const itemNumber = await pickItemNumber();

  // 見本モード: Gemini を呼ばず、用意した報告書を返す。照会中の演出が見えるよう少し待つ
  if (isSampleMode()) {
    await new Promise((resolve) => setTimeout(resolve, 6000 + Math.random() * 4000));
    const sample = renumberSample(pickSampleReport(), itemNumber);
    return Response.json(withToken({ itemNumber: sample.itemNumber, tone: sample.tone, report: sample.report }));
  }

  // API キーの枠を使い切らないよう、全体での1日の回数も制限する
  const daily = await hit({ name: "generate-daily", windowSeconds: 24 * 60 * 60, limit: dailyGenerateLimit() }, "all");
  if (!daily.ok) return tooManyRequests(daily.retryAfter, "本日の照会受付は終了しました。時間をおいて再試行してください。");

  try {
    const result = await generateReport({ data: source.bytes.toString("base64"), mimeType: source.type }, { itemNumber });
    return Response.json(withToken({ itemNumber: result.itemNumber, tone: result.plan.toneName, report: result.report }));
  } catch (error) {
    if (error instanceof GeminiUnavailableError || (error instanceof ApiError && error.status === 503)) {
      return errorResponse(503, "busy", "財団回線が混雑しています。時間をおいて再試行してください。");
    }
    if (error instanceof ReportFormatError) {
      console.error("[generate] format error:", error.message);
      return errorResponse(502, "format", "記録の照合に失敗しました。もう一度撮影してください。");
    }
    console.error("[generate] unexpected error:", error);
    return errorResponse(500, "internal", "観測端末で不明なエラーが発生しました。");
  }
}
