"use client";

/**
 * 撮影直後の写真を、メモリにも持っておく。
 *
 * iPhone の Safari では、IndexedDB に保存した直後の Blob を取り出して fetch で送ると、
 * 「Load failed」で送信に失敗することがある(WebKit の既知の不具合)。
 * 送信には、保存先を経由しないこちらのデータを使う。ページを読み込み直したときは消えるので、
 * そのときは保存先の Blob を使う。
 */
const photos = new Map<string, ArrayBuffer>();

export async function rememberPhoto(id: string, photo: Blob) {
  try {
    photos.set(id, await photo.arrayBuffer());
  } catch {
    // 読めなければ、送信時に保存先の Blob を使う
  }
}

/** 送信する写真のデータ。メモリにあればそれを、なければ保存先の Blob から読み出す */
export async function photoBytes(id: string, stored: Blob): Promise<ArrayBuffer> {
  const remembered = photos.get(id);
  if (remembered) return remembered;
  return stored.arrayBuffer();
}

export function forgetPhoto(id: string) {
  photos.delete(id);
}
