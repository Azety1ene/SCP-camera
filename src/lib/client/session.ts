"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type Clearance = "L2" | "O5";

export const CLEARANCE_LABEL: Record<Clearance, string> = {
  L2: "レベル2",
  O5: "O5",
};

export async function fetchClearance(): Promise<Clearance | null> {
  try {
    const res = await fetch("/api/auth", { cache: "no-store" });
    const body = (await res.json()) as { clearance: Clearance | null };
    return body.clearance;
  } catch {
    return null;
  }
}

/**
 * 認証が必要な画面で使う。未認証なら認証端末(/)へ戻す。
 * 判定が終わるまでは undefined を返す。
 */
export function useRequireClearance(): Clearance | undefined {
  const router = useRouter();
  const [clearance, setClearance] = useState<Clearance | undefined>(undefined);

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
  await fetch("/api/auth", { method: "DELETE" });
}
