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
  if (!staff) return <p className="px-4 py-12 text-sm text-muted">職員認証を確認中 …</p>;

  return (
    <TerminalShell staff={staff} screen={{ id: "LIB-0400", name: "書庫" }}>
      <h1 className="font-doc text-xl font-bold">書庫</h1>
      <p className="mt-1 text-xs text-muted">観測記録部門の職員が閲覧できる内部文書。閲覧できる範囲は、クリアランスに応じて変わります。</p>

      {/* 文書管理台帳: 1行が1文書。行全体を押すと開く */}
      <div className="ledger mt-6">
        <div className="grid grid-cols-[4.5rem_1fr_3.5rem] gap-3 border-b border-line py-2 text-[11px] text-muted">
          <span>文書番号</span>
          <span>件名</span>
          <span className="text-right">区分</span>
        </div>
        <ul>
          {DOCUMENTS.map((doc) => {
            const allowed = hasClearance(staff.clearance, doc.required);
            const locked = !!doc.passcode && staff.clearance !== "O5" && !unlocked.includes(doc.id);
            const status = !allowed ? "閲覧不可" : locked ? "施錠" : "閲覧可";
            return (
              <li key={doc.id} className="border-b border-dotted border-line">
                <Link
                  href={`/library/${doc.id}`}
                  onClick={() => play(allowed ? "tap" : "deny")}
                  className="grid min-h-16 grid-cols-[4.5rem_1fr_3.5rem] items-center gap-3 py-3 hover:bg-raised"
                >
                  <span className="font-mono text-[11px] text-muted">{doc.number.replace(/^(文書番号|掲示物) /, "").replace(/ 第.版$/, "")}</span>
                  <span className="min-w-0">
                    <span className={`block font-doc text-[14px] font-bold leading-6 ${allowed ? "text-foreground" : "text-muted"}`}>
                      {allowed ? doc.title : doc.title.replace(/[^\s()()]/g, (ch, i) => (i % 3 === 0 ? ch : "█"))}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {doc.issuer}
                      <span className={`ml-2 ${!allowed ? "text-danger" : locked ? "text-warn" : "text-accent"}`}>[{status}]</span>
                    </span>
                  </span>
                  <span className={`text-right font-mono text-[11px] ${allowed ? "text-foreground" : "text-danger"}`}>
                    {CLEARANCE_LABEL[doc.required].replace("レベル", "Lv")}
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
