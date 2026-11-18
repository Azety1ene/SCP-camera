"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CLEARANCE_LABEL, logout, type Clearance } from "@/lib/client/session.ts";
import { cctvTimestamp } from "@/lib/client/cctv.ts";

const NAV = [
  { href: "/scan", label: "観測" },
  { href: "/archive", label: "収容記録" },
  { href: "/about", label: "規約" },
] as const;

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

function useTerminalId(): string {
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

/** 認証後の画面で共通の枠。上部に所属・端末番号・クリアランス・時刻を出す */
export function TerminalShell({
  clearance,
  children,
  bare = false,
}: {
  clearance?: Clearance;
  children: ReactNode;
  /** カメラ画面のように、本文を全面に使うとき */
  bare?: boolean;
}) {
  const terminalId = useTerminalId();
  const clock = useClock();
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="z-20 border-b border-line bg-background/90 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-[11px] leading-5 text-muted backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="truncate">SCP財団 日本支部 統合観測ネットワーク</span>
          <span className="shrink-0 tabular-nums">{clock}</span>
        </div>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-3">
          <span className="whitespace-nowrap">
            端末 {terminalId} ／ クリアランス{" "}
            <span className={clearance === "O5" ? "text-danger" : "text-accent"}>
              {clearance ? CLEARANCE_LABEL[clearance] : "確認中"}
            </span>
          </span>
          <nav className="ml-auto flex shrink-0 gap-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname.startsWith(item.href) ? "text-foreground" : "hover:text-foreground"}
              >
                {item.label}
              </Link>
            ))}
            <button type="button" onClick={onLogout} className="hover:text-danger">
              退出
            </button>
          </nav>
        </div>
      </header>
      <div className={bare ? "relative flex flex-1 flex-col" : "mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6"}>
        {children}
      </div>
    </div>
  );
}
