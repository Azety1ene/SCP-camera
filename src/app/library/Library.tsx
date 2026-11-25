"use client";

import Link from "next/link";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { useStaff } from "@/lib/client/progress.ts";
import { CLEARANCE_LABEL, hasClearance } from "@/lib/client/session.ts";
import { useUnlockedDocs } from "@/lib/client/store.ts";
import { play } from "@/lib/client/sound.ts";
import { DOCUMENTS } from "@/lib/content/documents.ts";

export function Library() {
  const staff = useStaff();
  const unlocked = useUnlockedDocs();
  if (!staff) return <p className="px-4 py-12 font-mono text-xs text-muted">職員認証を確認中 …</p>;

  return (
    <TerminalShell staff={staff} screen={{ id: "LIB-0400", name: "書庫" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h1 className="font-doc text-lg font-bold tracking-wide">文書管理台帳</h1>
        <span className="font-mono text-[11px] text-muted">全 {DOCUMENTS.length} 件</span>
      </div>
      <p className="mt-3 text-xs text-muted">
        観測記録部門の職員に公開されている内部文書の一覧です。閲覧範囲はクリアランスに応じて制限されます。
      </p>

      <div className="ledger mt-5">
        <div className="grid grid-cols-[5rem_1fr_4rem] gap-3 border-b border-line bg-panel px-3 py-1.5 font-mono text-[10px] text-muted sm:grid-cols-[6rem_1fr_4.5rem]">
          <span>文書番号</span>
          <span>件名 ／ 発行元</span>
          <span className="text-right">区分</span>
        </div>
        <ul className="divide-y divide-line">
          {DOCUMENTS.map((doc) => {
            const allowed = hasClearance(staff.clearance, doc.required);
            const locked = !!doc.passcode && staff.clearance !== "O5" && !unlocked.includes(doc.id);
            const status = !allowed ? "閲覧不可" : locked ? "施錠" : "閲覧可";
            return (
              <li key={doc.id}>
                <Link
                  href={`/library/${doc.id}`}
                  onClick={() => play(allowed ? "tap" : "deny")}
                  className="grid min-h-16 grid-cols-[5rem_1fr_4rem] items-center gap-3 px-3 py-3 hover:bg-raised sm:grid-cols-[6rem_1fr_4.5rem]"
                >
                  <span className="font-mono text-[11px] text-muted">
                    {doc.number.replace(/^(文書番号|掲示物) /, "").replace(/ 第.版$/, "")}
                  </span>
                  <span className="min-w-0">
                    <span className={`block font-doc text-[14px] font-bold leading-6 ${allowed ? "text-foreground" : "text-muted"}`}>
                      {allowed ? doc.title : doc.title.replace(/[^\s()()]/g, (ch, i) => (i % 3 === 0 ? ch : "█"))}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                      <span>{doc.issuer}</span>
                      <span
                        className={`font-mono text-[10px] ${
                          !allowed ? "text-danger" : locked ? "text-warn" : "text-accent"
                        }`}
                      >
                        [{status}]
                      </span>
                    </span>
                  </span>
                  <span className="text-right font-mono text-[11px]">
                    <span
                      className={`inline-block border px-1.5 py-0.5 text-[10px] leading-none ${
                        allowed ? "border-line-strong bg-sunken text-foreground" : "border-danger/60 bg-danger/10 text-danger"
                      }`}
                    >
                      {CLEARANCE_LABEL[doc.required].replace("レベル", "Lv")}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </TerminalShell>
  );
}
