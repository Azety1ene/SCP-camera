/** 財団データベースの記録 ID(crypto.randomUUID が作る UUID v4)の形か */
export function isSharedId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
}
