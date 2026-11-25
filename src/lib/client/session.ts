"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** 合言葉で付与されるクリアランス(サーバーの Cookie に入る) */
export type ServerClearance = "L2" | "O5";

/**
 * 画面で使うクリアランス。L3・L4 は収容した件数に応じて端末内で昇格する(progress.ts)。
 * O5 は合言葉でのみ付与される。
 */
export type Clearance = "L2" | "L3" | "L4" | "O5";

export const CLEARANCE_LABEL: Record<Clearance, string> = {
  L2: "レベル2",
  L3: "レベル3",
  L4: "レベル4",
  O5: "O5",
};

export const CLEARANCE_RANK: Record<Clearance, number> = { L2: 2, L3: 3, L4: 4, O5: 5 };

export function hasClearance(have: Clearance, required: Clearance): boolean {
  return CLEARANCE_RANK[have] >= CLEARANCE_RANK[required];
}

/*
 * 認証の確認結果を、ページの中で覚えておく。
 * 画面を移るたびに /api/auth の応答を待つと、そのあいだ画面全体が「確認中」に切り替わってちらつくので、
 * 前に確認した結果ですぐに描き、裏で確かめ直す(認証が切れていたら、その時点で認証端末へ戻す)。
 * ページを読み込み直したときは覚えていないので、サーバーとクライアントの最初の描画は一致する。
 */
let known: ServerClearance | null | undefined = undefined;

export function knownClearance(): ServerClearance | null | undefined {
  return known;
}

/** 認証・退出したときに、覚えている結果を差し替える */
export function rememberClearance(value: ServerClearance | null) {
  known = value;
}

export async function fetchClearance(): Promise<ServerClearance | null> {
  try {
    const res = await fetch("/api/auth", { cache: "no-store" });
    const body = (await res.json()) as { clearance: ServerClearance | null };
    known = body.clearance;
    return body.clearance;
  } catch {
    return null;
  }
}

/**
 * 認証が必要な画面で使う。未認証なら認証端末(/)へ戻す。
 * 判定が終わるまでは undefined を返す(前に確認した結果があれば、それを先に返す)。
 */
export function useRequireClearance(): ServerClearance | undefined {
  const router = useRouter();
  const [clearance, setClearance] = useState<ServerClearance | undefined>(() => known ?? undefined);

  useEffect(() => {
    let cancelled = false;
    fetchClearance().then((value) => {
      if (cancelled) return;
      if (!value) router.replace("/");
      else setClearance(value);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return clearance;
}

export async function logout(): Promise<void> {
  // O5 の表示切り替えも解除する(progress.ts の OVERRIDE_KEY)
  try {
    localStorage.removeItem("scp-o5-view-as");
  } catch {
    // 無視してよい
  }
  known = null;
  await fetch("/api/auth", { method: "DELETE" });
}
