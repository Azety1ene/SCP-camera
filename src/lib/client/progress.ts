"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { listRecords } from "./db.ts";
import { fetchClearance, useRequireClearance, type Clearance, type ServerClearance } from "./session.ts";

/**
 * 職員としての進み具合。収容した件数でクリアランスが上がり、読める範囲が広がる。
 * 進捗は端末内の収容記録(IndexedDB)から毎回数え直すので、記録を消すと下がる。
 */

export const PROMOTIONS: { level: Clearance; at: number }[] = [
  { level: "L3", at: 3 },
  { level: "L4", at: 6 },
];

export function levelForCount(count: number): Clearance {
  let level: Clearance = "L2";
  for (const promotion of PROMOTIONS) if (count >= promotion.at) level = promotion.level;
  return level;
}

/** 次の昇格に必要な件数。O5 や最高位なら null */
export function nextPromotion(count: number, clearance: Clearance): { level: Clearance; at: number } | null {
  if (clearance === "O5") return null;
  return PROMOTIONS.find((promotion) => count < promotion.at) ?? null;
}

export type StaffState = {
  /** 合言葉で付与されたクリアランス */
  server: ServerClearance;
  /** 画面で使うクリアランス(昇格や、O5 の表示切り替えを反映したもの) */
  clearance: Clearance;
  /** 収容済みの件数 */
  contained: number;
  /** O5 が、メニューから別のクリアランスに表示を切り替えている */
  overridden: boolean;
};

/*
 * O5 の表示切り替え(開発・確認用)。O5 で認証した端末だけ、メニューから好きなクリアランスで画面を見られる。
 * サーバーの認証は O5 のままで、変わるのは画面の表示だけ。退出・認証し直しで解除する。
 */
const OVERRIDE_KEY = "scp-o5-view-as";
const OVERRIDE_EVENT = "scp-o5-view-as-change";
const OVERRIDE_LEVELS: Clearance[] = ["L2", "L3", "L4"];

export function readClearanceOverride(): Clearance | null {
  try {
    const value = localStorage.getItem(OVERRIDE_KEY) as Clearance | null;
    return value && OVERRIDE_LEVELS.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/** null で解除(O5 に戻す) */
export function setClearanceOverride(value: Clearance | null) {
  try {
    if (value && value !== "O5") localStorage.setItem(OVERRIDE_KEY, value);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    // 保存できなければ切り替わらないだけ
  }
  window.dispatchEvent(new Event(OVERRIDE_EVENT));
}

function subscribeOverride(onChange: () => void) {
  window.addEventListener(OVERRIDE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OVERRIDE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useClearanceOverride(): Clearance | null {
  return useSyncExternalStore(subscribeOverride, readClearanceOverride, () => null);
}

export function effectiveClearance(server: ServerClearance, contained: number, override: Clearance | null = null): Clearance {
  if (server === "O5") return override ?? "O5";
  return levelForCount(contained);
}

function staffState(server: ServerClearance, contained: number, override: Clearance | null): StaffState {
  const active = server === "O5" && override !== null;
  return { server, clearance: effectiveClearance(server, contained, override), contained, overridden: active };
}

/** 端末内の収容記録を数えて、昇格を反映したクリアランスを返す(認証画面など、画面の外で使う) */
export async function resolveClearance(server: ServerClearance): Promise<Clearance> {
  const contained = await listRecords()
    .then((records) => records.filter((record) => record.status === "done").length)
    .catch(() => 0);
  return effectiveClearance(server, contained, readClearanceOverride());
}

/** 認証が必要な画面で使う。未認証なら認証端末へ戻す。判定が終わるまでは undefined */
export function useStaff(): StaffState | undefined {
  const server = useRequireClearance();
  const [contained, setContained] = useState<number | null>(null);

  useEffect(() => {
    if (!server) return;
    let cancelled = false;
    listRecords()
      .then((records) => records.filter((record) => record.status === "done").length)
      .catch(() => 0)
      .then((count) => {
        if (!cancelled) setContained(count);
      });
    return () => {
      cancelled = true;
    };
  }, [server]);

  const override = useClearanceOverride();
  // 同じ内容なら同じオブジェクトを返す(受け取った側の effect が毎回走らないように)
  return useMemo(
    () => (server && contained !== null ? staffState(server, contained, override) : undefined),
    [server, contained, override],
  );
}

/** 文字列から決まる 0〜1 の値。黒塗りの開示順などを、毎回同じにするために使う */
export function stableFraction(text: string): number {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash % 1000) / 1000;
}

/**
 * 報告書の黒塗り([[...]])1つを読むのに必要なクリアランス。
 * 昇格するほど少しずつ読める箇所が増え、すべて読めるのは O5 だけ。
 */
export function requiredForRedaction(text: string): Clearance {
  const fraction = stableFraction(text);
  if (fraction < 0.3) return "L3";
  if (fraction < 0.6) return "L4";
  return "O5";
}

/**
 * 認証していなくても開ける画面(規約など)で使う。
 * 判定中は undefined、未認証なら null、認証済みなら職員の状態を返す。
 */
export function useOptionalStaff(): StaffState | null | undefined {
  const [server, setServer] = useState<ServerClearance | null | undefined>(undefined);
  const [contained, setContained] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchClearance().then(async (value) => {
      if (cancelled) return;
      if (!value) {
        setServer(null);
        return;
      }
      const count = await listRecords()
        .then((records) => records.filter((record) => record.status === "done").length)
        .catch(() => 0);
      if (cancelled) return;
      setContained(count);
      setServer(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const override = useClearanceOverride();
  return useMemo(() => {
    if (server === undefined) return undefined;
    if (server === null || contained === null) return null;
    return staffState(server, contained, override);
  }, [server, contained, override]);
}
