"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { BackIcon } from "@/components/Icons.tsx";
import { useOptionalStaff } from "@/lib/client/progress.ts";
import { play } from "@/lib/client/sound.ts";

/**
 * 規約ページの枠。認証済みならいつもの枠(タブとメニュー付き)で、
 * 認証画面から来たときは「戻る」ボタン付きの単独の画面で出す。
 */
export function AboutFrame({ children }: { children: ReactNode }) {
  const staff = useOptionalStaff();
  const router = useRouter();

  const body = (
    <div className="space-y-8 text-sm leading-7">
      <h1 className="text-xl font-bold">規約・ライセンス</h1>
      {children}
    </div>
  );

  if (staff) return <TerminalShell staff={staff}>{body}</TerminalShell>;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => {
            play("tap");
            // 履歴があれば来た画面へ、なければ認証端末へ戻る
            if (window.history.length > 1) router.back();
            else router.push("/");
          }}
          className="btn btn-secondary -ml-1"
        >
          <BackIcon className="h-4 w-4" />
          戻る
        </button>
      </div>
      {body}
    </main>
  );
}
