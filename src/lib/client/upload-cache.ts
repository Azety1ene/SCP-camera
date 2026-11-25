"use client";

/**
 * 撮影直後の画像を、メモリにも持っておく。
 *
 * iPhone の Safari では、IndexedDB に保存した直後の Blob を取り出して fetch で送ったり表示したりすると、
 * 「Load failed」で失敗することがある(WebKit の既知の不具合)。撮影した端末では、ページを読み込み直すまでは
 * 保存先を経由しないこちらのデータを、送信・表示・登録に使う。ページを読み込み直したときは消えるので、
 * そのときは保存先の Blob を使う。
 *
 * メモリを使い続けないよう、持っておくのは直近の数件だけにする。
 */

type Entry = {
  /** 生成に送る元画像 */
  photo?: ArrayBuffer;
  /** 監視カメラ風に加工した画像(報告書の添付資料) */
  filtered?: Blob;
  /** 財団データベースに登録するときの添付画像 */
  share?: Blob;
};

const MAX_ENTRIES = 3;
const entries = new Map<string, Entry>();

function touch(id: string, patch: Entry) {
  const next = { ...entries.get(id), ...patch };
  entries.delete(id);
  entries.set(id, next);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}

export async function rememberPhoto(id: string, photo: Blob) {
  try {
    touch(id, { photo: await photo.arrayBuffer() });
  } catch {
    // 読めなければ、送信時に保存先の Blob を使う
  }
}

/** 送信する写真のデータ。メモリにあればそれを、なければ保存先の Blob から読み出す */
export async function photoBytes(id: string, stored: Blob | undefined): Promise<ArrayBuffer> {
  const remembered = entries.get(id)?.photo;
  if (remembered) return remembered;
  if (!stored) throw new Error("記録画像が見つかりません");
  return stored.arrayBuffer();
}

/** 生成が終わったら、元画像はもう送らないので手放す */
export function forgetPhoto(id: string) {
  const entry = entries.get(id);
  if (entry) entry.photo = undefined;
}

export function rememberFiltered(id: string, photo: Blob) {
  touch(id, { filtered: photo });
}

export function freshFiltered(id: string): Blob | undefined {
  return entries.get(id)?.filtered;
}

export function rememberShare(id: string, photo: Blob) {
  touch(id, { share: photo });
}

export function freshShare(id: string): Blob | undefined {
  return entries.get(id)?.share;
}

/** 記録を抹消したときなど */
export function forgetAll(id: string) {
  entries.delete(id);
}
