"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { StoredReport } from "@/lib/report/schema.ts";

/**
 * 収容記録(報告書)はブラウザの IndexedDB に保存する。
 * 利用者が「財団データベースに登録する」を押したものだけ、サーバー(全職員で共有)にも送る。
 *
 * 一覧や件数を数えるときに画像まで読み込まないよう、記録の情報(records)と画像(photos)は別の置き場所に分けている。
 * 書き込むたびに RECORDS_EVENT を流すので、表示中の画面は件数や状態を数え直せる。
 */

export type RecordStatus = "pending" | "done" | "error";

export type ContainmentRecord = {
  id: string;
  createdAt: number;
  status: RecordStatus;
  itemNumber?: string;
  tone?: string;
  report?: StoredReport;
  error?: { code: string; message: string };
  /** 生成を始めた時刻。リロードで二重に生成しないために使う */
  requestedAt?: number;
  /** 照会した回数。結果を受け取れなかったときの自動の再照会を、1回までにするために使う */
  attempts?: number;
  /** 照会時にサーバーが発行した登録票。財団データベースに登録するときに使う */
  shareToken?: string;
  /** 財団データベースに登録したときの ID */
  sharedId?: string;
  /** 財団データベースから取り下げるための鍵(登録した端末にだけある) */
  sharedDeleteKey?: string;
  /** 照会直後の「登録しますか?」で「この端末にのみ保存」を選んだ。後からでも登録できる */
  shareDeclined?: boolean;
  /** 撮影時に顔の自動[編集済み]処理を行えたか。skipped は顔検出を使えなかった */
  faceCheck?: "done" | "skipped";
};

export type RecordPhotos = {
  id: string;
  /** 生成に送る元画像(JPEG) */
  photo: Blob;
  /** 監視カメラ風に加工した画像(報告書の添付資料) */
  photoFiltered: Blob;
  /** 財団データベースに登録するときの添付画像(加工済みを縮小したもの)。照会のときに指紋をサーバーに渡す */
  photoShare?: Blob;
};

/** 版1で records ストアに直接入っていた画像フィールド(後方互換用) */
type LegacyRecordWithPhotos = ContainmentRecord & Partial<Pick<RecordPhotos, "photo" | "photoFiltered">>;

interface ScpDB extends DBSchema {
  records: {
    key: string;
    value: ContainmentRecord;
    indexes: { "by-created": number; "by-status": RecordStatus };
  };
  photos: {
    key: string;
    value: RecordPhotos;
  };
}

/** 記録が変わったことを、表示中の画面に知らせるイベント(detail は記録の ID) */
export const RECORDS_EVENT = "scp-records-change";

function announce(id: string) {
  window.dispatchEvent(new CustomEvent(RECORDS_EVENT, { detail: id }));
}

let dbPromise: Promise<IDBPDatabase<ScpDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<ScpDB>("scp-camera", 2, {
      // upgrade は必ず同期処理だけで終わらせる(await や Blob コピーを挟むと Safari 等で TransactionInactiveError になるため)
      upgrade(database, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1 && !database.objectStoreNames.contains("records")) {
          const store = database.createObjectStore("records", { keyPath: "id" });
          store.createIndex("by-created", "createdAt");
        }
        if (oldVersion < 2) {
          if (!database.objectStoreNames.contains("photos")) {
            database.createObjectStore("photos", { keyPath: "id" });
          }
          const records = transaction.objectStore("records");
          if (!records.indexNames.contains("by-status")) {
            records.createIndex("by-status", "status");
          }
        }
      },
      blocking(_current, _blocked, event) {
        // 別タブが新しい版を開こうとしたとき、古い接続を閉じてハングを防ぐ
        (event.target as IDBDatabase | null)?.close();
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function saveRecord(record: ContainmentRecord, photos: Omit<RecordPhotos, "id">): Promise<void> {
  const database = await db();
  const tx = database.transaction(["records", "photos"], "readwrite");
  const photoEntry: RecordPhotos = {
    id: record.id,
    photo: photos.photo,
    photoFiltered: photos.photoFiltered,
    ...(photos.photoShare ? { photoShare: photos.photoShare } : {}),
  };
  await Promise.all([tx.objectStore("photos").put(photoEntry), tx.objectStore("records").put(record), tx.done]);
  announce(record.id);
}

export async function getRecord(id: string): Promise<ContainmentRecord | undefined> {
  return (await db()).get("records", id);
}

export async function getPhotos(id: string): Promise<RecordPhotos | undefined> {
  const database = await db();
  const found = await database.get("photos", id);
  if (found) return found;
  // 版1で保存された記録は records 側に直接画像が入っているため、互換のためそこから取り出す
  const legacy = (await database.get("records", id)) as LegacyRecordWithPhotos | undefined;
  if (legacy?.photo && legacy?.photoFiltered) {
    return { id, photo: legacy.photo, photoFiltered: legacy.photoFiltered };
  }
  return undefined;
}

export async function updateRecord(id: string, patch: Partial<ContainmentRecord>): Promise<ContainmentRecord | undefined> {
  const database = await db();
  const tx = database.transaction("records", "readwrite");
  const current = await tx.store.get(id);
  if (!current) return undefined;
  const next = { ...current, ...patch, id };
  await Promise.all([tx.store.put(next), tx.done]);
  announce(id);
  return next;
}

export async function updatePhotos(id: string, patch: Partial<Omit<RecordPhotos, "id">>): Promise<void> {
  const database = await db();
  const existing = await getPhotos(id);
  if (!existing) return;
  const tx = database.transaction("photos", "readwrite");
  await Promise.all([tx.store.put({ ...existing, ...patch, id }), tx.done]);
}

/** 新しい順(画像は含まない) */
export async function listRecords(): Promise<ContainmentRecord[]> {
  const all = await (await db()).getAllFromIndex("records", "by-created");
  return all.reverse();
}

/** 収容済み(報告書ができた)の件数。画像も報告書も読み込まずに数える */
export async function countContained(): Promise<number> {
  return (await db()).countFromIndex("records", "by-status", "done");
}

export async function deleteRecord(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(["records", "photos"], "readwrite");
  await Promise.all([tx.objectStore("records").delete(id), tx.objectStore("photos").delete(id), tx.done]);
  announce(id);
}

export function newRecordId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
