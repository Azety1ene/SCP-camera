"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CLEARANCE_LABEL, logout } from "@/lib/client/session.ts";
import type { StaffState } from "@/lib/client/progress.ts";
import { cctvTimestamp } from "@/lib/client/cctv.ts";
import { ensureProfile, syncMail, useInbox } from "@/lib/client/store.ts";
import { play } from "@/lib/client/sound.ts";
import { SoundToggle } from "@/components/SoundToggle.tsx";

const TERMINAL_ID_KEY = "scp-terminal-id";
const FALLBACK_TERMINAL_ID = "JP-81██-····";

/** 端末ごとに固定の識別番号を返す。初回に作ってブラウザに保存する(見た目のためだけのもの) */
function readTerminalId(): string {
  try {
    let value = localStorage.getItem(TERMINAL_ID_KEY);
    if (!value) {
      value = `JP-81${Math.floor(Math.random() * 90 + 10)}-${Math.floor(Math.random() * 9000 + 1000)}`;
      localStorage.setItem(TERMINAL_ID_KEY, value);
    }
    return value;
  } catch {
    return FALLBACK_TERMINAL_ID;
  }
}

const subscribeNothing = () => () => {};

export function useTerminalId(): string {
  return useSyncExternalStore(subscribeNothing, readTerminalId, () => FALLBACK_TERMINAL_ID);
}

function useClock(): string {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => setNow(cctvTimestamp(new Date()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * 届いたことをまだ知らせていない新着メール。
 * effect が2回走っても(開発時の React など)、知らせ損ねないよう effect の外に置く
 */
let pendingNotice: string | null = null;

/** 条件を満たした社内メールを届け、新着があれば知らせる */
function MailWatcher({ staff }: { staff: StaffState }) {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    ensureProfile();
    // 着任時の案内は最初から届いているものとして、知らせない
    const worth = syncMail(staff).filter((mail) => mail.id !== "welcome");
    if (worth.length) {
      pendingNotice = worth.length === 1 ? worth[0].subject : `${worth[0].subject} ほか${worth.length - 1}件`;
      play("mail");
    }
    if (!pendingNotice) return;
    const timer = setTimeout(() => {
      setNotice(pendingNotice);
      pendingNotice = null;
    }, 0);
    return () => clearTimeout(timer);
  }, [staff]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return (
    <Link
      href="/inbox"
      role="status"
      className="glitch-in fixed inset-x-4 top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] z-50 mx-auto block max-w-sm border border-accent bg-background px-4 py-3 text-xs leading-6 shadow-lg"
    >
      <span className="block text-accent glow">新着メール</span>
      <span className="text-foreground">{notice}</span>
    </Link>
  );
}

/** 認証後の画面で共通の枠。上部に所属・端末番号・クリアランス・時刻と、各画面への移動を出す */
export function TerminalShell({
  staff,
  children,
  bare = false,
}: {
  staff?: StaffState;
  children: ReactNode;
  /** カメラ画面のように、本文を全面に使うとき */
  bare?: boolean;
}) {
  const terminalId = useTerminalId();
  const clock = useClock();
  const pathname = usePathname();
  const router = useRouter();
  const unread = useInbox().filter((mail) => !mail.read).length;
  const clearance = staff?.clearance;

  const nav = [
    { href: "/portal", label: "ポータル" },
    { href: "/scan", label: "観測" },
    { href: "/archive", label: "収容記録" },
    { href: "/library", label: "書庫" },
    { href: "/inbox", label: unread ? `受信箱(${unread})` : "受信箱" },
    { href: "/id", label: "職員証" },
    { href: "/about", label: "規約" },
  ];

  async function onLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="z-20 border-b border-line bg-background/90 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] text-[11px] leading-5 text-muted backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="truncate">SCP財団 日本支部 統合観測ネットワーク</span>
          <span className="shrink-0 tabular-nums">{clock}</span>
        </div>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="whitespace-nowrap">
            端末 {terminalId} ／ クリアランス{" "}
            <span className={clearance === "O5" ? "text-danger" : "text-accent"}>
              {clearance ? CLEARANCE_LABEL[clearance] : "確認中"}
            </span>
          </span>
          <span className="flex shrink-0 gap-3">
            <SoundToggle />
            <button type="button" onClick={onLogout} className="hover:text-danger">
              退出
            </button>
          </span>
        </div>
        {/* 画面の切り替え。スマホでは横にスクロールできる */}
        <nav className="mx-auto -mx-4 mt-1 flex max-w-3xl gap-4 overflow-x-auto whitespace-nowrap px-4 pb-2 [scrollbar-width:none] sm:mx-auto">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => play("tap")}
                className={active ? "border-b border-accent text-foreground" : "hover:text-foreground"}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {staff && <MailWatcher staff={staff} />}
      <div className={bare ? "relative flex flex-1 flex-col" : "mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6"}>
        {children}
      </div>
    </div>
  );
}
