import { ApiError } from "@google/genai";
import { cookies } from "next/headers";
import { GeminiUnavailableError } from "@/lib/gemini.ts";
import { generateReport, ReportFormatError } from "@/lib/report/generate.ts";
import { pickSampleReport, isSampleMode } from "@/lib/report/samples.ts";
import { signReport } from "@/lib/report/token.ts";
import { decodeSession, SESSION_COOKIE } from "@/lib/session.ts";

// 生成には数分かかることがあるため、上限を長めにとる(秒)
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * POST /api/generate
 * multipart/form-data の `image` に撮影画像を入れて送る。職員認証済みのCookieが必要。
 */
export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return errorResponse(401, "unauthorized", "職員認証が必要です。");

  let image: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("image");
    image = value instanceof File ? value : null;
  } catch {
    return errorResponse(400, "bad_request", "画像を受け取れませんでした。");
  }

  if (!image) return errorResponse(400, "bad_request", "画像が添付されていません。");
  if (!ALLOWED_TYPES.has(image.type)) return errorResponse(415, "unsupported_type", "対応していない画像形式です。");
  if (image.size > MAX_IMAGE_BYTES) return errorResponse(413, "too_large", "画像が大きすぎます。");

  // 見本モード: Gemini を呼ばず、用意した報告書を返す。照会中の演出が見えるよう少し待つ
  if (isSampleMode()) {
    await new Promise((resolve) => setTimeout(resolve, 6000 + Math.random() * 4000));
    const sample = pickSampleReport();
    const body = { itemNumber: sample.itemNumber, tone: sample.tone, report: sample.report };
    return Response.json({ ...body, token: signReport(body) });
  }

  const data = Buffer.from(await image.arrayBuffer()).toString("base64");

  try {
    const result = await generateReport({ data, mimeType: image.type });
    const body = { itemNumber: result.itemNumber, tone: result.plan.toneName, report: result.report };
    // 財団データベースに登録するときの登録票
    return Response.json({ ...body, token: signReport(body) });
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
