"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { countContained, RECORDS_EVENT } from "./db.ts";
import { fetchClearance, knownClearance, useRequireClearance, type Clearance, type ServerClearance } from "./session.ts";

/**
 * 職員としての進み具合。収容した件数でクリアランスが上がり、読める範囲が広がる。
 * 進捗は端末内の収容記録(IndexedDB)から数え直すので、記録を消すと下がる。
 * 記録が増えたり消えたりしたら(db.ts の RECORDS_EVENT)、表示中の画面でもすぐに数え直す。
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

/** 次の昇格に必要な件数。O5 や最高位なら null(O5 の表示切り替え中は、呼び出し側で別に扱う) */
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
  const contained = await countContained().catch(() => 0);
  lastContained = contained;
  return effectiveClearance(server, contained, readClearanceOverride());
}

/** 前に数えた件数。画面を移ったとき、数え直すのを待たずに描くために使う */
let lastContained: number | null = null;

/** 収容済みの件数。記録が変わるたびに数え直す。数え終わるまでは前に数えた値(なければ null) */
function useContained(enabled: boolean): number | null {
  const [contained, setContained] = useState<number | null>(() => lastContained);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const recount = () =>
      countContained()
        .catch(() => 0)
        .then((count) => {
          lastContained = count;
          if (!cancelled) setContained(count);
        });
    recount();
    window.addEventListener(RECORDS_EVENT, recount);
    return () => {
      cancelled = true;
      window.removeEventListener(RECORDS_EVENT, recount);
    };
  }, [enabled]);

  return contained;
}

/** 認証が必要な画面で使う。未認証なら認証端末へ戻す。判定が終わるまでは undefined */
export function useStaff(): StaffState | undefined {
  const server = useRequireClearance();
  const contained = useContained(!!server);

  const override = useClearanceOverride();
  // 同じ内容なら同じオブジェクトを返す(受け取った側の effect が毎回走らないように)
  return useMemo(
    () => (server && contained !== null ? staffState(server, contained, override) : undefined),
    [server, contained, override],
  );
}

/**
 * 認証していなくても開ける画面(規約など)で使う。
 * 判定中は undefined、未認証なら null、認証済みなら職員の状態を返す。
 */
export function useOptionalStaff(): StaffState | null | undefined {
  const [server, setServer] = useState<ServerClearance | null | undefined>(() => knownClearance());
  const contained = useContained(!!server);

  useEffect(() => {
    let cancelled = false;
    fetchClearance().then((value) => {
      if (!cancelled) setServer(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const override = useClearanceOverride();
  return useMemo(() => {
    if (server === null) return null;
    if (server === undefined || contained === null) return undefined;
    return staffState(server, contained, override);
  }, [server, contained, override]);
}
