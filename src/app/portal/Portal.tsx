"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { TerminalShell, useTerminalId } from "@/components/TerminalShell.tsx";
import { nextPromotion, PROMOTIONS, useStaff, type StaffState } from "@/lib/client/progress.ts";
import { CLEARANCE_LABEL } from "@/lib/client/session.ts";
import { useInbox, useProfile } from "@/lib/client/store.ts";
import { play } from "@/lib/client/sound.ts";
import { newsForToday } from "@/lib/content/news.ts";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-line bg-panel/60 p-4">
      <h2 className="mb-3 text-[11px] tracking-[0.2em] text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 py-1.5 text-xs last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right text-foreground">{value}</span>
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
  const progress = next ? (staff.contained - previousAt) / (next.at - previousAt) : 1;
  const unread = inbox.filter((mail) => !mail.read);
  const observatory = `81-OP-${terminalId.slice(-4)}`;
  const callName = profile.name || (profile.staffNo ? `職員 ${profile.staffNo}` : "新任職員");

  return (
    <TerminalShell staff={staff}>
      {alarm && <BreachAlarm onDone={() => setAlarm(false)} />}

      <p className="text-[11px] tracking-[0.4em] text-muted">確保 ・ 収容 ・ 保護</p>
      <h1 className="mt-2 text-lg text-accent glow">
        {greeting(hour)}、{callName}
      </h1>
      {night && (
        <p className="mt-2 border-l-2 border-warn pl-3 text-xs leading-6 text-warn">
          夜間当直の時間帯です。観測業務は通常どおり行えますが、照会結果に通常と異なる記載が含まれる場合があります。
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Panel title="配属">
          <Row label="観測所" value={observatory} />
          <Row label="所属" value="サイト-81██ 観測記録部門" />
          <Row label="職員分類" value="Cクラス" />
          <Row
            label="クリアランス"
            value={<span className={staff.clearance === "O5" ? "text-danger" : "text-accent"}>{CLEARANCE_LABEL[staff.clearance]}</span>}
          />
          <Row label="着任日" value={profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString("ja-JP") : "—"} />
        </Panel>

        <Panel title="観測実績">
          <p className="text-3xl text-foreground tabular-nums">
            {staff.contained}
            <span className="ml-1 text-xs text-muted">件 収容</span>
          </p>
          {next ? (
            <>
              <div className="mt-3 h-1.5 w-full bg-line">
                <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">
                {CLEARANCE_LABEL[next.level]}への昇格審査まで あと {next.at - staff.contained} 件
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs text-muted">
              {staff.clearance === "O5" ? "O5権限のため、すべての記録を閲覧できます。" : "現在の職位で閲覧できる最大の範囲に達しています。"}
            </p>
          )}
          <Link
            href="/scan"
            onClick={() => play("tap")}
            className="mt-4 block border border-accent px-4 py-2 text-center text-sm text-accent hover:bg-accent hover:text-background"
          >
            観測を開始する
          </Link>
        </Panel>

        <Panel title="受信箱">
          {unread.length ? (
            <>
              <p className="text-xs text-foreground">未読のメールが {unread.length} 件あります。</p>
              <Link href="/inbox" className="mt-2 block truncate text-xs text-accent underline">
                {unread[0].subject}
              </Link>
            </>
          ) : (
            <p className="text-xs text-muted">未読のメールはありません。</p>
          )}
        </Panel>

        <Panel title="財団内報">
          <ul className="space-y-2 text-xs leading-5">
            {newsForToday(now)
              .slice(0, 4)
              .map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-accent">■</span>
                  <span className="text-foreground/90">{item}</span>
                </li>
              ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Link href="/library" className="border border-line px-4 py-3 text-center text-muted hover:text-foreground">
          書庫
        </Link>
        <Link href="/id" className="border border-line px-4 py-3 text-center text-muted hover:text-foreground">
          職員証
        </Link>
      </div>

      <p className="mt-8 border-t border-line pt-3 text-[10px] leading-5 text-muted">
        知る必要性の原則により、本端末に表示される情報は、あなたの職務に必要な範囲に制限されています。
      </p>
    </TerminalShell>
  );
}
