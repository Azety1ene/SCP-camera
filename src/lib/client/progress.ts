"use client";

import { useEffect, useMemo, useState } from "react";
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
  /** 画面で使うクリアランス(昇格を反映したもの) */
  clearance: Clearance;
  /** 収容済みの件数 */
  contained: number;
};

export function effectiveClearance(server: ServerClearance, contained: number): Clearance {
  return server === "O5" ? "O5" : levelForCount(contained);
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

  // 同じ内容なら同じオブジェクトを返す(受け取った側の effect が毎回走らないように)
  return useMemo(
    () => (server && contained !== null ? { server, clearance: effectiveClearance(server, contained), contained } : undefined),
    [server, contained],
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

  return useMemo(() => {
    if (server === undefined) return undefined;
    if (server === null || contained === null) return null;
    return { server, clearance: effectiveClearance(server, contained), contained };
  }, [server, contained]);
}
