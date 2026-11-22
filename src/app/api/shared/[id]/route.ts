import { del } from "@vercel/blob";
import { cookies } from "next/headers";
import { deleteShared, getShared } from "@/lib/server/shared.ts";
import { decodeSession, SESSION_COOKIE } from "@/lib/session.ts";

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

const isId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

/** GET /api/shared/:id  登録された報告書の全文。O5 だけが読める部分は、表示側で隠す */
export async function GET(_request: Request, ctx: RouteContext<"/api/shared/[id]">) {
  if (!decodeSession((await cookies()).get(SESSION_COOKIE)?.value)) return errorResponse(401, "unauthorized", "職員認証が必要です。");
  const { id } = await ctx.params;
  if (!isId(id)) return errorResponse(404, "not_found", "該当する記録は存在しません。");
  try {
    const item = await getShared(id);
    return item ? Response.json({ item }) : errorResponse(404, "not_found", "該当する記録は存在しません。");
  } catch (error) {
    console.error("[shared] get failed:", error);
    return errorResponse(503, "db", "財団データベースに接続できません。");
  }
}

/** DELETE /api/shared/:id  O5 だけが削除できる */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/shared/[id]">) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return errorResponse(401, "unauthorized", "職員認証が必要です。");
  if (session.clearance !== "O5") return errorResponse(403, "forbidden", "この操作には O5 権限が必要です。");
  const { id } = await ctx.params;
  if (!isId(id)) return errorResponse(404, "not_found", "該当する記録は存在しません。");
  try {
    const imageUrl = await deleteShared(id);
    if (!imageUrl) return errorResponse(404, "not_found", "該当する記録は存在しません。");
    await del(imageUrl).catch((error) => console.error("[shared] blob delete failed:", error));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[shared] delete failed:", error);
    return errorResponse(503, "db", "財団データベースに接続できません。");
  }
}
