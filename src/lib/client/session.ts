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

export async function fetchClearance(): Promise<ServerClearance | null> {
  try {
    const res = await fetch("/api/auth", { cache: "no-store" });
    const body = (await res.json()) as { clearance: ServerClearance | null };
    return body.clearance;
  } catch {
    return null;
  }
}

/**
 * 認証が必要な画面で使う。未認証なら認証端末(/)へ戻す。
 * 判定が終わるまでは undefined を返す。
 */
export function useRequireClearance(): ServerClearance | undefined {
  const router = useRouter();
  const [clearance, setClearance] = useState<ServerClearance | undefined>(undefined);

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
  await fetch("/api/auth", { method: "DELETE" });
}
