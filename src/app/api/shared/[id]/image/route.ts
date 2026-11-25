import { cookies } from "next/headers";
import { readSharedImage } from "@/lib/server/blob.ts";
import { getSharedImage } from "@/lib/server/shared.ts";
import { isSharedId } from "@/lib/shared-id.ts";
import { decodeSession, SESSION_COOKIE } from "@/lib/session.ts";

/**
 * GET /api/shared/:id/image  財団データベースの添付画像。職員認証済みの Cookie が必要。
 * 取り下げ・抹消したあとに残らないよう、キャッシュは閲覧した端末の中だけで短くする
 */
export async function GET(request: Request, ctx: RouteContext<"/api/shared/[id]/image">) {
  if (!decodeSession((await cookies()).get(SESSION_COOKIE)?.value)) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  if (!isSharedId(id)) return new Response(null, { status: 404 });

  try {
    const image = await getSharedImage(id);
    if (!image) return new Response(null, { status: 404 });
    const result = await readSharedImage(image.url, image.access, request.headers.get("if-none-match") ?? undefined);
    if (!result) return new Response(null, { status: 404 });

    const headers = new Headers({
      "Cache-Control": "private, max-age=600",
      ETag: result.blob.etag,
      "X-Content-Type-Options": "nosniff",
    });
    if (result.statusCode === 304) return new Response(null, { status: 304, headers });
    headers.set("Content-Type", result.blob.contentType);
    headers.set("Content-Length", String(result.blob.size));
    return new Response(result.stream, { headers });
  } catch (error) {
    console.error("[shared] image failed:", error);
    return new Response(null, { status: 503 });
  }
}
