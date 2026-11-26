"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { TerminalShell, useTerminalId } from "@/components/TerminalShell.tsx";
import { nextPromotion, PROMOTIONS, useStaff, type StaffState } from "@/lib/client/progress.ts";
import { CLEARANCE_LABEL } from "@/lib/client/session.ts";
import { useInbox, useProfile } from "@/lib/client/store.ts";
import { play } from "@/lib/client/sound.ts";
import { newsForToday, type NewsItem } from "@/lib/content/news.ts";

/** 業務帳票の1区画 */
function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ledger">
      <div className="ledger-title">
        <h2>{title}</h2>
        {aside && <span className="font-mono text-[11px] font-normal text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function greeting(hour: number) {
  if (hour >= 22 || hour < 5) return "夜間当直";
  if (hour < 11) return "午前勤務";
  if (hour < 18) return "通常勤務";
  return "夕方勤務";
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
    <div role="alert" className="fixed inset-0 z-[90] flex flex-col items-center justify-center px-6 text-center">
      <div className={`absolute inset-0 ${phase === "alarm" ? "breach-flash bg-[#4a0c08]" : "bg-background/95"}`} />
      {phase === "alarm" ? (
        <div className="relative w-full max-w-md border-2 border-[#ff867a] bg-[#2a0705] p-6 space-y-3">
          <p className="font-mono text-xs font-bold tracking-[0.25em] text-[#ffb3a8]">緊急警報 // BREACH</p>
          <p className="font-doc text-2xl font-bold text-[#ff7b6e]">収容違反発生</p>
          <p className="text-sm leading-7 text-[#ffd6d0]">
            サイト-81██ 第3収容区画にて収容違反を検知しました。
            <br />
            全職員はその場で待機してください。
          </p>
        </div>
      ) : (
        <div className="glitch-in relative w-full max-w-md border border-line-strong bg-panel p-6 space-y-2">
          <p className="font-mono text-sm font-bold text-accent">警報は誤報でした</p>
          <p className="text-xs leading-6 text-muted">通常業務に戻ってください。本件について、記録を残す必要はありません。</p>
        </div>
      )}
    </div>
  );
}

const ALARM_KEY = "scp-breach-shown";

export function Portal() {
  const staff = useStaff();
  if (!staff) return <p className="px-4 py-12 font-mono text-xs text-muted">職員認証を確認中 …</p>;
  return <PortalBody staff={staff} />;
}

/** 内報の1件。見出しを押すと発信元と本文を開く */
function NewsRow({ item }: { item: NewsItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          play("tap");
          setOpen((v) => !v);
        }}
        className="flex min-h-11 w-full items-start gap-2.5 px-3 py-2.5 text-left text-[0.84rem] leading-6 hover:bg-raised"
      >
        <span aria-hidden className="mt-0.5 w-3 shrink-0 font-mono text-xs text-muted">
          {open ? "▾" : "▸"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mr-2 inline-block border border-line bg-sunken px-1.5 py-0 font-mono text-[10px] leading-5 text-muted">
            {item.from}
          </span>
          <span className="text-foreground">{item.headline}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line/60 bg-sunken px-4 py-3 font-doc text-[0.86rem] leading-7 text-foreground/95">
          <p>{item.body}</p>
        </div>
      )}
    </li>
  );
}

/** 認証の確認が済んでから描く(時刻はこの時点の端末の時計で決める) */
function PortalBody({ staff }: { staff: StaffState }) {
  const profile = useProfile();
  const inbox = useInbox(staff.server);
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
  const staffDisplay = profile.name || (profile.staffNo ? `職員 ${profile.staffNo}` : "新任職員(未登録)");

  return (
    <TerminalShell staff={staff} screen={{ id: "PTL-0100", name: "業務トップ" }}>
      {alarm && <BreachAlarm onDone={() => setAlarm(false)} />}

      {/* 画面見出し行 */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h1 className="font-doc text-lg font-bold tracking-wide text-foreground">業務トップ</h1>
        <p className="font-mono text-[11px] text-muted">
          {now.toLocaleDateString("ja-JP")} ／{" "}
          <span className={night ? "text-warn" : "text-foreground"}>{greeting(hour)}</span>
        </p>
      </div>

      {night && (
        <div className="mt-4 border border-warn/60 bg-warn/10 px-3 py-2 text-xs leading-6 text-warn">
          <span className="mr-2 font-mono font-bold">[夜間当直]</span>
          観測業務は通常どおり行えますが、照会結果に通常と異なる記載が含まれる場合があります。
        </div>
      )}

      {/* 未読通達 */}
      {unread.length > 0 && (
        <Link
          href="/inbox"
          onClick={() => play("tap")}
          className="mt-4 flex items-center justify-between gap-3 border border-seal bg-panel px-3.5 py-2.5 text-sm hover:bg-raised"
        >
          <span className="min-w-0 truncate">
            <span className="mr-2 border border-seal bg-seal/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-seal-text">
              未読 {unread.length}件
            </span>
            <span className="text-foreground">{unread[0].subject}</span>
          </span>
          <span className="shrink-0 font-mono text-xs text-muted">受信箱 &gt;</span>
        </Link>
      )}

      {/* 職員勤務・観測状況票(1枚の帳票テーブルにまとめる) */}
      <div className="mt-5">
        <Section title="職員・観測状況" aside={observatory}>
          <dl className="grid grid-cols-1 divide-y divide-line text-sm sm:grid-cols-2 sm:divide-y-0">
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2 sm:border-r">
              <dt className="shrink-0 text-xs text-muted">職員</dt>
              <dd className="truncate font-mono text-[13px] text-foreground">{staffDisplay}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2">
              <dt className="shrink-0 text-xs text-muted">所属</dt>
              <dd className="truncate font-mono text-[13px] text-foreground">
                {staff.clearance === "O5" ? "O5評議会" : "サイト-81██ 観測記録部門"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2 sm:border-r">
              <dt className="shrink-0 text-xs text-muted">クリアランス</dt>
              <dd className={`font-mono text-[13px] font-bold ${staff.clearance === "O5" ? "text-seal-text" : "text-accent"}`}>
                {CLEARANCE_LABEL[staff.clearance]}
                {staff.overridden && <span className="ml-1.5 text-[11px] text-seal-text">(表示切替中)</span>}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2">
              <dt className="shrink-0 text-xs text-muted">着任日</dt>
              <dd className="font-mono text-[13px] tabular-nums text-foreground">
                {profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString("ja-JP") : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-3 py-2.5 sm:border-r">
              <dt className="shrink-0 text-xs text-muted">収容記録数</dt>
              <dd className="font-mono text-base font-bold tabular-nums text-foreground">
                {staff.contained}
                <span className="ml-1 text-xs font-normal text-muted">件</span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
              <dt className="shrink-0 text-xs text-muted">昇格審査</dt>
              <dd className="text-right font-mono text-xs text-foreground">
                {staff.overridden ? (
                  <span className="text-muted">O5表示切替中(判定外)</span>
                ) : next ? (
                  <>
                    {CLEARANCE_LABEL[next.level]}まで あと{" "}
                    <span className="font-bold text-foreground">{next.at - staff.contained}</span> 件
                  </>
                ) : staff.clearance === "O5" ? (
                  <span className="text-seal-text">全記録閲覧可</span>
                ) : (
                  <span className="text-muted">現職位の上限に到達</span>
                )}
              </dd>
            </div>
          </dl>

          {/* 昇格審査までの目盛りと、業務実行バー */}
          <div className="border-t border-line bg-sunken px-3 py-3">
            {next && !staff.overridden && (
              <div className="mb-3 flex items-center gap-2 font-mono text-[11px] text-muted">
                <span className="shrink-0">進捗</span>
                <div className="flex flex-1 gap-1" aria-hidden>
                  {Array.from({ length: next.at - previousAt }, (_, i) => (
                    <span
                      key={i}
                      className={`h-2 flex-1 border ${
                        i < staff.contained - previousAt ? "border-foreground bg-foreground" : "border-line-strong bg-background"
                      }`}
                    />
                  ))}
                </div>
                <span className="shrink-0 tabular-nums">
                  {staff.contained - previousAt}/{next.at - previousAt}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted">
                周囲の物品を観測し、異常性の有無を財団データベースへ照会します。
              </p>
              <Link href="/scan" onClick={() => play("tap")} className="btn btn-primary shrink-0">
                観測を開始する
              </Link>
            </div>
          </div>
        </Section>
      </div>

      {/* 財団内報(掲示板) */}
      <div className="mt-6">
        <Section title="財団内報" aside="項目を選択して展開">
          <ul>
            {newsForToday(now)
              .slice(0, 4)
              .map((item) => (
                <NewsRow key={item.headline} item={item} />
              ))}
          </ul>
        </Section>
      </div>

      {/* 事務フッター */}
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 font-mono text-[10px] text-muted">
        <span>確保・収容・保護</span>
        <span>知る必要性の原則に基づき表示範囲を制限しています</span>
      </footer>
    </TerminalShell>
  );
}
