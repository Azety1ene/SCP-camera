"use client";

import { useState } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { BackIcon } from "@/components/Icons.tsx";
import { RichText } from "@/components/report/RichText.tsx";
import { useStaff } from "@/lib/client/progress.ts";
import { markMailRead, useInbox, useProfile, type InboxItem } from "@/lib/client/store.ts";
import { play } from "@/lib/client/sound.ts";
import type { Clearance } from "@/lib/client/session.ts";

function formatDate(time: number) {
  const d = new Date(time);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function MailView({ mail, to, clearance, onBack }: { mail: InboxItem; to: string; clearance: Clearance; onBack: () => void }) {
  return (
    <div>
      <button type="button" onClick={onBack} className="btn btn-secondary mb-4">
        <BackIcon className="h-4 w-4" />
        受信箱に戻る
      </button>
      <article className="bg-paper font-doc text-[15px] leading-[1.9] text-ink shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_20px_60px_rgba(0,0,0,0.6)]">
        <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5 border-b border-ink/20 bg-ink/[0.05] px-5 py-3 font-mono text-[11px] leading-5">
          <dt className="text-ink/75">差出人</dt>
          <dd className="break-all">
            {mail.from} &lt;{mail.address}&gt;
          </dd>
          <dt className="text-ink/75">宛先</dt>
          <dd className="break-all">{to}</dd>
          <dt className="text-ink/75">日時</dt>
          <dd>{formatDate(mail.arrivedAt)}</dd>
          <dt className="text-ink/75">件名</dt>
          <dd className="font-bold">{mail.subject}</dd>
        </dl>
        <div className="px-5 pb-8 pt-5">
          <RichText text={mail.body} clearance={clearance} className="mb-3" />
        </div>
      </article>
    </div>
  );
}

export function Inbox() {
  const staff = useStaff();
  const inbox = useInbox();
  const profile = useProfile();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!staff) return <p className="px-4 py-12 text-sm text-muted">職員認証を確認中 …</p>;

  const open = inbox.find((mail) => mail.id === openId);
  const to = `${profile.name || "職員"} <${profile.staffNo || "unassigned"}@site81.scp.int>`;

  return (
    <TerminalShell staff={staff} screen={{ id: "MSG-0500", name: "受信箱" }}>
      {open ? (
        <MailView mail={open} to={to} clearance={staff.clearance} onBack={() => setOpenId(null)} />
      ) : (
        <>
          <h1 className="font-doc text-xl font-bold">受信箱</h1>
          <p className="mt-1 text-xs text-muted">所属部門・人事局からの通知が届きます。本端末のメールは、端末の外へ持ち出すことができません。</p>
          {inbox.length === 0 ? (
            <p className="mt-8 text-sm text-muted">メールはまだ届いていません。</p>
          ) : (
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {inbox.map((mail) => (
                <li key={mail.id}>
                  <button
                    type="button"
                    onClick={() => {
                      play("tap");
                      markMailRead(mail.id);
                      setOpenId(mail.id);
                    }}
                    className="flex w-full items-start gap-3 py-3 text-left hover:bg-panel/60"
                  >
                    <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${mail.read ? "bg-transparent" : "bg-seal"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-3 text-[11px] text-muted">
                        <span className="truncate">{mail.from}</span>
                        <span className="shrink-0 tabular-nums">{formatDate(mail.arrivedAt)}</span>
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-sm ${mail.read ? "text-foreground/80" : "text-foreground"} ${
                          mail.important ? "font-bold" : ""
                        }`}
                      >
                        {mail.important && <span className="mr-1 text-seal-text">[重要]</span>}
                        {mail.subject}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </TerminalShell>
  );
}
