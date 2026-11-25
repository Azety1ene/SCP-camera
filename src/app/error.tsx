"use client";

import Link from "next/link";
import { useEffect } from "react";

/** 画面の描画中に想定外のエラーが起きたとき。世界観を崩さず、やり直しと戻る先を出す */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[error]", error);
  }, [error]);

  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <section className="border-2 border-seal bg-panel">
        <div className="flex items-center justify-between border-b border-line-strong bg-sunken px-4 py-2 font-mono text-[11px]">
          <span className="font-bold text-seal-text">TERMINAL FAULT</span>
          <span className="text-muted">異常検知</span>
        </div>
        <div className="space-y-4 p-6 text-sm leading-7">
          <p className="font-doc text-lg font-bold text-foreground">観測端末で異常が発生しました</p>
          <p className="text-xs leading-6 text-muted">
            画面の表示中に予期しない状態を検知しました。この事象は記録されました。
          </p>
          {digest && <p className="border border-line bg-sunken px-3 py-1.5 font-mono text-[11px] text-muted">障害コード: {digest}</p>}
          <div className="flex flex-wrap gap-3 pt-2">
            <button type="button" onClick={() => retry()} className="btn btn-primary">
              再試行する
            </button>
            <Link href="/portal" className="btn btn-secondary">
              業務トップに戻る
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
