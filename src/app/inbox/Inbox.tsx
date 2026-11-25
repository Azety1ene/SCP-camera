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

/** 端末内の社内電文ビューア(紙の公文書ではなく、イントラネット上の業務通達として表現する) */
function MailView({ mail, to, clearance, onBack }: { mail: InboxItem; to: string; clearance: Clearance; onBack: () => void }) {
  return (
    <div>
      <button type="button" onClick={onBack} className="btn btn-secondary mb-4 text-xs">
        <BackIcon className="h-4 w-4" />
        受信一覧に戻る
      </button>
      <article data-classified className="terminal-prose border border-line-strong bg-sunken">
        <div className="flex items-center justify-between border-b border-line-strong bg-panel px-4 py-2 font-mono text-[11px] text-muted">
          <span>社内電文 // INTERNAL MAIL</span>
          <span className="tabular-nums">{formatDate(mail.arrivedAt)}</span>
        </div>
        <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 border-b border-line bg-panel/60 px-4 py-3 font-mono text-[11px] leading-5">
          <dt className="text-muted">差出人</dt>
          <dd className="break-all text-foreground">
            {mail.from} <span className="text-muted">&lt;{mail.address}&gt;</span>
          </dd>
          <dt className="text-muted">宛先</dt>
          <dd className="break-all text-foreground">{to}</dd>
          <dt className="text-muted">件名</dt>
          <dd className="font-ui text-sm font-bold text-foreground">
            {mail.important && <span className="mr-1.5 font-mono text-xs text-seal-text">[重要]</span>}
            {mail.subject}
          </dd>
        </dl>
        <div className="px-4 py-6 font-doc text-[15px] leading-[1.95] text-foreground sm:px-6">
          <RichText text={mail.body} clearance={clearance} className="mb-4 last:mb-0" />
        </div>
        <div className="border-t border-line bg-panel px-4 py-2 font-mono text-[10px] text-muted">
          ※ 本電文は端末外への転送・持ち出しが禁じられています。
        </div>
      </article>
    </div>
  );
}

export function Inbox() {
  const staff = useStaff();
  const inbox = useInbox(staff?.server);
  const profile = useProfile();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!staff) return <p className="px-4 py-12 font-mono text-xs text-muted">職員認証を確認中 …</p>;

  const open = inbox.find((mail) => mail.id === openId);
  const to = `${profile.name || "職員"} <${profile.staffNo || "unassigned"}@site81.scp.int>`;
  const unreadCount = inbox.filter((m) => !m.read).length;

  return (
    <TerminalShell staff={staff} screen={{ id: "MSG-0500", name: "受信箱" }}>
      {open ? (
        <MailView mail={open} to={to} clearance={staff.clearance} onBack={() => setOpenId(null)} />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
            <h1 className="font-doc text-lg font-bold tracking-wide">受信箱</h1>
            <span className="font-mono text-[11px] text-muted">
              全 {inbox.length} 件 ／ 未読 <span className={unreadCount > 0 ? "font-bold text-seal-text" : ""}>{unreadCount}</span> 件
            </span>
          </div>
          <p className="mt-3 text-xs text-muted">
            所属部門・人事局からの業務連絡および辞令が届きます。本端末の電文は外部へ持ち出すことができません。
          </p>
          {inbox.length === 0 ? (
            <p className="mt-6 border border-line bg-panel px-4 py-5 text-sm text-muted">受信した電文はありません。</p>
          ) : (
            <div className="ledger mt-5">
              <div className="grid grid-cols-[3.25rem_1fr] gap-2 border-b border-line bg-panel px-3 py-1.5 font-mono text-[10px] text-muted">
                <span>状態</span>
                <span>件名 ／ 差出人・受信日時</span>
              </div>
              <ul className="divide-y divide-line">
                {inbox.map((mail) => (
                  <li key={mail.id}>
                    <button
                      type="button"
                      onClick={() => {
                        play("tap");
                        markMailRead(mail.id);
                        setOpenId(mail.id);
                      }}
                      className={`grid w-full grid-cols-[3.25rem_1fr] items-start gap-2 px-3 py-3 text-left hover:bg-raised ${
                        mail.read ? "bg-background" : "bg-panel/45"
                      }`}
                    >
                      <span className="pt-0.5 font-mono text-[10px]">
                        {mail.read ? (
                          <span className="text-muted">既読</span>
                        ) : (
                          <span className="border border-seal bg-seal/15 px-1 py-0.5 font-bold text-seal-text">未読</span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block truncate text-sm ${
                            mail.read ? "text-foreground/80" : "font-bold text-foreground"
                          }`}
                        >
                          {mail.important && <span className="mr-1 font-mono text-xs text-seal-text">[重要]</span>}
                          {mail.subject}
                        </span>
                        <span className="mt-1 flex flex-wrap justify-between gap-x-3 font-mono text-[11px] text-muted">
                          <span className="truncate">{mail.from}</span>
                          <span className="shrink-0 tabular-nums">{formatDate(mail.arrivedAt)}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </TerminalShell>
  );
}
