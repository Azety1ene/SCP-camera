"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { TerminalShell, useTerminalId } from "@/components/TerminalShell.tsx";
import { nextPromotion, PROMOTIONS, useStaff, type StaffState } from "@/lib/client/progress.ts";
import { CLEARANCE_LABEL } from "@/lib/client/session.ts";
import { useInbox, useProfile } from "@/lib/client/store.ts";
import { play } from "@/lib/client/sound.ts";
import { newsForToday, type NewsItem } from "@/lib/content/news.ts";

/** 帳票の一区画。箱で囲まず、上の太い罫線と見出しで区切る */
function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ledger">
      <div className="ledger-title flex items-baseline justify-between">
        <h2>{title}</h2>
        {aside && <span className="font-ui text-[11px] font-normal text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ledger-row">
      <span className="text-muted">{label}</span>
      <span className="text-right font-mono text-[13px] text-foreground">{value}</span>
    </div>
  );
}

function greeting(hour: number) {
  if (hour >= 22 || hour < 5) return "夜間当直、おつかれさまです";
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "おつかれさまです";
  return "こんばんは";
}

/** まれに鳴る収容違反の警報。数秒後に「誤報でした」と戻る */
function BreachAlarm({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"alarm" | "false">("alarm");
  useEffect(() => {
    play("alarm");
    const toFalse = setTimeout(() => setPhase("false"), 4200);
    const close = setTimeout(onDone, 7600);
    return () => {
      clearTimeout(toFalse);
      clearTimeout(close);
    };
  }, [onDone]);

  return (
    <div role="alert" className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 px-8 text-center">
      <div className={`absolute inset-0 ${phase === "alarm" ? "breach-flash bg-[#5a0d08]" : "bg-background/95"}`} />
      {phase === "alarm" ? (
        <div className="relative space-y-3">
          <p className="text-xs tracking-[0.4em] text-[#ffb3a8]">WARNING</p>
          <p className="text-2xl font-bold text-[#ff6a5a]">収容違反発生</p>
          <p className="text-sm leading-7 text-[#ffd2cc]">
            サイト-81██ 第3収容区画にて収容違反を検知しました。
            <br />
            全職員はその場で待機してください。
          </p>
        </div>
      ) : (
        <div className="glitch-in relative space-y-3">
          <p className="text-sm text-accent glow">警報は誤報でした</p>
          <p className="text-xs leading-6 text-muted">通常業務に戻ってください。本件について、記録を残す必要はありません。</p>
        </div>
      )}
    </div>
  );
}

const ALARM_KEY = "scp-breach-shown";

export function Portal() {
  const staff = useStaff();
  if (!staff) return <p className="px-4 py-12 text-sm text-muted">職員認証を確認中 …</p>;
  return <PortalBody staff={staff} />;
}

/** 内報の1件。見出しをタップすると、発信元と本文を開く */
function NewsRow({ item }: { item: NewsItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-dotted border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          play("tap");
          setOpen((v) => !v);
        }}
        className="flex min-h-11 w-full items-start gap-2 py-2.5 text-left text-[0.85rem] leading-6 hover:bg-raised"
      >
        <span aria-hidden className="mt-0.5 w-3 shrink-0 font-mono text-xs text-muted">
          {open ? "▾" : "▸"}
        </span>
        <span className="text-foreground/90">{item.headline}</span>
      </button>
      {open && (
        <div className="pb-3 pl-5 font-doc text-[0.85rem] leading-7">
          <p className="text-xs text-muted">発信: {item.from}</p>
          <p className="mt-1 text-foreground/90">{item.body}</p>
        </div>
      )}
    </li>
  );
}

/** 認証の確認が済んでから描く(時刻はこの時点の端末の時計で決める) */
function PortalBody({ staff }: { staff: StaffState }) {
  const profile = useProfile();
  const inbox = useInbox();
  const terminalId = useTerminalId();
  const [now] = useState(() => new Date());
  const [alarm, setAlarm] = useState(false);

  // ポータルを開いたとき、ごくまれに警報が鳴る(1回の起動につき最大1回)
  useEffect(() => {
    let shown = false;
    try {
      shown = sessionStorage.getItem(ALARM_KEY) === "1";
    } catch {
      shown = true;
    }
    if (shown || Math.random() > 0.05) return;
    try {
      sessionStorage.setItem(ALARM_KEY, "1");
    } catch {
      // 保存できなくても問題ない
    }
    const timer = setTimeout(() => setAlarm(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  const hour = now.getHours();
  const night = hour >= 22 || hour < 5;
  const next = nextPromotion(staff.contained, staff.clearance);
  const previousAt = [...PROMOTIONS].reverse().find((p) => staff.contained >= p.at)?.at ?? 0;
  const unread = inbox.filter((mail) => !mail.read);
  const observatory = `81-OP-${terminalId.slice(-4)}`;
  const callName = profile.name || (profile.staffNo ? `職員 ${profile.staffNo}` : "新任職員");

  return (
    <TerminalShell staff={staff} screen={{ id: "PTL-0100", name: "ポータル" }}>
      {alarm && <BreachAlarm onDone={() => setAlarm(false)} />}

      <h1 className="text-lg font-bold leading-snug">
        {greeting(hour)}、{callName}
      </h1>
      {night && (
        <p className="mt-3 bg-warn/10 px-3 py-2 text-xs leading-6 text-warn">
          【夜間当直】観測業務は通常どおり行えますが、照会結果に通常と異なる記載が含まれる場合があります。
        </p>
      )}

      {/* 観測実績: この画面で一番大事なものなので、最初に大きく置く */}
      <section className="mt-6 ledger">
        <div className="ledger-title flex items-baseline justify-between">
          <h2>観測実績</h2>
          <span className="font-ui text-[11px] font-normal text-muted">{observatory}</span>
        </div>
        <div className="flex items-end justify-between gap-4 py-4">
          <p className="font-mono text-5xl leading-none tabular-nums">
            {staff.contained}
            <span className="ml-2 font-ui text-sm text-muted">件 収容</span>
          </p>
          <p className="pb-1 text-right text-xs leading-5 text-muted">
            {next ? (
              <>
                {CLEARANCE_LABEL[next.level]}の昇格審査まで
                <br />
                あと <span className="font-mono text-base text-foreground">{next.at - staff.contained}</span> 件
              </>
            ) : staff.clearance === "O5" ? (
              "O5権限:全記録を閲覧可"
            ) : (
              "現職位の閲覧範囲の上限"
            )}
          </p>
        </div>
        {next && (
          <div className="mb-4 flex gap-1" aria-hidden>
            {Array.from({ length: next.at - previousAt }, (_, i) => (
              <span key={i} className={`h-2 flex-1 ${i < staff.contained - previousAt ? "bg-foreground" : "bg-line"}`} />
            ))}
          </div>
        )}
        <Link href="/scan" onClick={() => play("tap")} className="btn btn-primary btn-lg w-full">
          観測を開始する
        </Link>
      </section>

      {unread.length > 0 && (
        <Link href="/inbox" className="mt-6 flex items-center justify-between gap-3 border border-seal/60 px-4 py-3 text-sm hover:bg-seal/10">
          <span className="min-w-0">
            <span className="mr-2 font-bold text-seal-text">未読 {unread.length} 件</span>
            <span className="text-foreground">{unread[0].subject}</span>
          </span>
          <span className="shrink-0 text-muted">開く</span>
        </Link>
      )}

      <div className="mt-8 grid gap-8 sm:grid-cols-[1fr_1.3fr]">
        <Section title="配属">
          <Row label="所属" value={staff.clearance === "O5" ? "O5評議会" : "サイト-81██ 観測記録部門"} />
          <Row
            label="クリアランス"
            value={<span className={staff.clearance === "O5" ? "text-seal-text" : "text-accent"}>{CLEARANCE_LABEL[staff.clearance]}</span>}
          />
          <Row label="着任日" value={profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString("ja-JP") : "—"} />
        </Section>

        <Section title="財団内報" aside={now.toLocaleDateString("ja-JP")}>
          <ul>
            {newsForToday(now)
              .slice(0, 4)
              .map((item) => (
                <NewsRow key={item.headline} item={item} />
              ))}
          </ul>
        </Section>
      </div>

      <p className="mt-10 text-center font-doc text-xs tracking-[0.5em] text-muted">確保・収容・保護</p>
      <p className="mt-2 text-center text-[10px] leading-5 text-muted">
        知る必要性の原則により、本端末に表示される情報は職務に必要な範囲に制限されています。
      </p>
    </TerminalShell>
  );
}
