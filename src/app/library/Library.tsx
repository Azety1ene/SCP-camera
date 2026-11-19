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
    <TerminalShell staff={staff}>
      <h1 className="text-lg text-accent glow">書庫</h1>
      <p className="mt-1 text-xs text-muted">観測記録部門の職員が閲覧できる内部文書。閲覧できる範囲は、クリアランスに応じて変わります。</p>

      <ul className="mt-6 space-y-3">
        {DOCUMENTS.map((doc) => {
          const allowed = hasClearance(staff.clearance, doc.required);
          const locked = !!doc.passcode && staff.clearance !== "O5" && !unlocked.includes(doc.id);
          return (
            <li key={doc.id} className="glitch-in">
              <Link
                href={`/library/${doc.id}`}
                onClick={() => play(allowed ? "tap" : "deny")}
                className="block border border-line bg-panel/60 p-4 hover:border-accent/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm leading-6 ${allowed ? "text-foreground" : "text-muted"}`}>
                    {allowed ? doc.title : doc.title.replace(/[^\s()()]/g, (ch, i) => (i % 3 === 0 ? ch : "█"))}
                  </p>
                  <span
                    className={`shrink-0 border px-1.5 py-0.5 text-[10px] ${
                      allowed ? "border-accent/60 text-accent" : "border-danger/60 text-danger"
                    }`}
                  >
                    {CLEARANCE_LABEL[doc.required]}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  {doc.number} ／ {doc.issuer}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {!allowed ? "閲覧権限がありません。" : locked ? "パスコードで保護されています。" : doc.summary}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </TerminalShell>
  );
}
