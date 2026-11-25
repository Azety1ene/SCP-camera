import { cookies } from "next/headers";
import { tokenHash } from "@/lib/report/token.ts";
import { deleteSharedImage } from "@/lib/server/blob.ts";
import { deleteShared, getShared } from "@/lib/server/shared.ts";
import { isSharedId } from "@/lib/shared-id.ts";
import { decodeSession, SESSION_COOKIE } from "@/lib/session.ts";

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/** GET /api/shared/:id  登録された報告書の全文。O5 だけが読める部分は、表示側で隠す */
export async function GET(_request: Request, ctx: RouteContext<"/api/shared/[id]">) {
  if (!decodeSession((await cookies()).get(SESSION_COOKIE)?.value)) return errorResponse(401, "unauthorized", "職員認証が必要です。");
  const { id } = await ctx.params;
  if (!isSharedId(id)) return errorResponse(404, "not_found", "該当する記録は存在しません。");
  try {
    const item = await getShared(id);
    return item ? Response.json({ item }) : errorResponse(404, "not_found", "該当する記録は存在しません。");
  } catch (error) {
    console.error("[shared] get failed:", error);
    return errorResponse(503, "db", "財団データベースに接続できません。");
  }
}

/**
 * DELETE /api/shared/:id
 * 登録した端末は、登録時に受け取った鍵を x-delete-key ヘッダーに入れて取り下げられる。O5 は鍵なしで何でも削除できる
 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/shared/[id]">) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return errorResponse(401, "unauthorized", "職員認証が必要です。");
  const deleteKey = request.headers.get("x-delete-key");
  if (session.clearance !== "O5" && !deleteKey) return errorResponse(403, "forbidden", "この操作には O5 権限が必要です。");
  const { id } = await ctx.params;
  if (!isSharedId(id)) return errorResponse(404, "not_found", "該当する記録は存在しません。");
  try {
    const image = await deleteShared(id, session.clearance === "O5" ? undefined : tokenHash(deleteKey!));
    if (!image) {
      return session.clearance === "O5"
        ? errorResponse(404, "not_found", "該当する記録は存在しません。")
        : errorResponse(403, "forbidden", "この記録を取り下げる権限がありません。");
    }
    await deleteSharedImage(image.url, image.access).catch((error) => console.error("[shared] blob delete failed:", error));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[shared] delete failed:", error);
    return errorResponse(503, "db", "財団データベースに接続できません。");
  }
}
