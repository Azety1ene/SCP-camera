"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { StoredReport } from "@/lib/report/schema.ts";

/**
 * 収容記録(報告書)はブラウザの IndexedDB に保存する。
 * 利用者が「財団データベースに登録する」を押したものだけ、サーバー(全職員で共有)にも送る。
 */

export type RecordStatus = "pending" | "done" | "error";

export type ContainmentRecord = {
  id: string;
  createdAt: number;
  status: RecordStatus;
  /** 生成に送る元画像(JPEG) */
  photo: Blob;
  /** 監視カメラ風に加工した画像(報告書の添付資料) */
  photoFiltered: Blob;
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
};

interface ScpDB extends DBSchema {
  records: {
    key: string;
    value: ContainmentRecord;
    indexes: { "by-created": number };
  };
}

let dbPromise: Promise<IDBPDatabase<ScpDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<ScpDB>("scp-camera", 1, {
      upgrade(database) {
        const store = database.createObjectStore("records", { keyPath: "id" });
        store.createIndex("by-created", "createdAt");
      },
    });
  }
  return dbPromise;
}

export async function saveRecord(record: ContainmentRecord): Promise<void> {
  await (await db()).put("records", record);
}

export async function getRecord(id: string): Promise<ContainmentRecord | undefined> {
  return (await db()).get("records", id);
}

export async function updateRecord(id: string, patch: Partial<ContainmentRecord>): Promise<ContainmentRecord | undefined> {
  const database = await db();
  const current = await database.get("records", id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  await database.put("records", next);
  return next;
}

/** 新しい順 */
export async function listRecords(): Promise<ContainmentRecord[]> {
  const all = await (await db()).getAllFromIndex("records", "by-created");
  return all.reverse();
}

export async function deleteRecord(id: string): Promise<void> {
  await (await db()).delete("records", id);
}

export function newRecordId(): string {
  return crypto.randomUUID();
}
