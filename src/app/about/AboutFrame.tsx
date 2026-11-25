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
    <div className="space-y-6 text-sm leading-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h1 className="font-doc text-lg font-bold tracking-wide">規約・ライセンス</h1>
        <span className="font-mono text-[11px] text-muted">SYS-0900</span>
      </div>
      {children}
    </div>
  );

  if (staff) return <TerminalShell staff={staff} screen={{ id: "SYS-0900", name: "規約" }}>{body}</TerminalShell>;

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background">
      <header className="border-b-2 border-line-strong bg-panel pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-11 max-w-2xl items-center justify-between border-x border-line px-4">
          <button
            type="button"
            onClick={() => {
              play("tap");
              if (window.history.length > 1) router.back();
              else router.push("/");
            }}
            className="flex h-8 items-center gap-1.5 border border-line-strong bg-raised px-2.5 text-xs font-bold text-foreground hover:bg-[#2d2b27]"
          >
            <BackIcon className="h-3.5 w-3.5" />
            戻る
          </button>
          <span className="font-mono text-[11px] text-muted">SYS-0900 規約・ライセンス</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col border-x border-line/60 px-4 pb-12 pt-6 sm:px-6">
        {body}
      </main>
    </div>
  );
}
