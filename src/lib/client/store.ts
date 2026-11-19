"use client";

import { useSyncExternalStore } from "react";
import { MAILS, type Mail, type MailContext } from "@/lib/content/mail.ts";

/**
 * 端末内に保存する小さな状態(localStorage)。保存できない環境でも画面は動くようにする。
 * 値が変わったら同じタブの他の画面にも知らせるため、独自のイベントを流す。
 */

const EVENT = "scp-store-change";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても、このページの間は動く
  }
  cache.delete(key);
  window.dispatchEvent(new Event(EVENT));
}

// useSyncExternalStore は同じ値を返し続ける必要があるので、読んだ値を文字列ごとに覚えておく
const cache = new Map<string, { raw: string | null; value: unknown }>();

function snapshot<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  const value = raw ? read(key, fallback) : fallback;
  cache.set(key, { raw, value });
  return value;
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function useStored<T>(key: string, fallback: T): T {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(key, fallback),
    () => fallback,
  );
}

// ---- 職員の情報 ----

export type StaffProfile = { name: string; staffNo: string; joinedAt: number; photo?: string };

const PROFILE_KEY = "scp-profile";
const EMPTY_PROFILE: StaffProfile = { name: "", staffNo: "", joinedAt: 0 };

/** 初回に職員番号と着任日を決めて保存する */
export function ensureProfile(): StaffProfile {
  const current = read<StaffProfile>(PROFILE_KEY, EMPTY_PROFILE);
  if (current.staffNo) return current;
  const created: StaffProfile = {
    ...current,
    staffNo: `81-${String(Math.floor(Math.random() * 9000) + 1000)}-${String(Math.floor(Math.random() * 900) + 100)}`,
    joinedAt: Date.now(),
  };
  write(PROFILE_KEY, created);
  return created;
}

export function useProfile(): StaffProfile {
  return useStored(PROFILE_KEY, EMPTY_PROFILE);
}

export function updateProfile(patch: Partial<StaffProfile>) {
  write(PROFILE_KEY, { ...ensureProfile(), ...patch });
}

// ---- 受信箱 ----

type MailState = { arrived: Record<string, number>; read: string[] };
const MAIL_KEY = "scp-mail";
const EMPTY_MAIL: MailState = { arrived: {}, read: [] };

/** 条件を満たしたメールを「届いた」ことにする。新しく届いたメールを返す */
export function syncMail(ctx: MailContext): Mail[] {
  const state = read<MailState>(MAIL_KEY, EMPTY_MAIL);
  const now = Date.now();
  const arrived: Mail[] = [];
  MAILS.forEach((mail, index) => {
    if (state.arrived[mail.id] || !mail.when(ctx)) return;
    // 同時に届いたメールの並びが定義順になるよう、少しずつ時刻をずらす
    state.arrived[mail.id] = now + index;
    arrived.push(mail);
  });
  if (arrived.length) write(MAIL_KEY, state);
  return arrived;
}

export type InboxItem = Mail & { arrivedAt: number; read: boolean };

export function useInbox(): InboxItem[] {
  const state = useStored<MailState>(MAIL_KEY, EMPTY_MAIL);
  return MAILS.filter((mail) => state.arrived[mail.id])
    .map((mail) => ({ ...mail, arrivedAt: state.arrived[mail.id], read: state.read.includes(mail.id) }))
    .sort((a, b) => b.arrivedAt - a.arrivedAt);
}

export function markMailRead(id: string) {
  const state = read<MailState>(MAIL_KEY, EMPTY_MAIL);
  if (state.read.includes(id)) return;
  write(MAIL_KEY, { ...state, read: [...state.read, id] });
}

// ---- 書庫のパスコード ----

const UNLOCK_KEY = "scp-unlocked-docs";
// useSyncExternalStore に渡す既定値は、毎回同じオブジェクトでないといけない
const NO_UNLOCKED: string[] = [];

export function useUnlockedDocs(): string[] {
  return useStored<string[]>(UNLOCK_KEY, NO_UNLOCKED);
}

export function unlockDoc(id: string) {
  const current = read<string[]>(UNLOCK_KEY, []);
  if (!current.includes(id)) write(UNLOCK_KEY, [...current, id]);
}

// ---- 報告書の評価(好き / 好きじゃない) ----

const RATING_KEY = "scp-ratings";
const NO_RATINGS: Record<string, 1 | -1> = {};

export function useRatings(): Record<string, 1 | -1> {
  return useStored<Record<string, 1 | -1>>(RATING_KEY, NO_RATINGS);
}

export function setRating(recordId: string, value: 1 | -1 | 0) {
  const current = { ...read<Record<string, 1 | -1>>(RATING_KEY, {}) };
  if (value === 0) delete current[recordId];
  else current[recordId] = value;
  write(RATING_KEY, current);
}
