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
import {
  ArchiveIcon,
  BookIcon,
  CameraIcon,
  CloseIcon,
  DocIcon,
  Emblem,
  ExitIcon,
  HomeIcon,
  IdIcon,
  MailIcon,
  MenuIcon,
} from "@/components/Icons.tsx";

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
      className="glitch-in fixed inset-x-4 top-[max(5.5rem,calc(env(safe-area-inset-top)+5rem))] z-50 mx-auto flex max-w-sm items-center gap-3 rounded-md border border-accent/60 bg-raised px-4 py-3 shadow-xl"
    >
      <MailIcon className="h-5 w-5 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="block text-[11px] text-accent">新着メール</span>
        <span className="block truncate text-sm text-foreground">{notice}</span>
      </span>
    </Link>
  );
}

const TABS = [
  { href: "/portal", label: "ポータル", Icon: HomeIcon },
  { href: "/scan", label: "観測", Icon: CameraIcon },
  { href: "/archive", label: "収容記録", Icon: ArchiveIcon },
  { href: "/library", label: "書庫", Icon: BookIcon },
  { href: "/inbox", label: "受信箱", Icon: MailIcon },
] as const;

/** 画面下のタブ。指で押しやすい高さにし、今いる画面を色と上の線で示す */
function TabBar({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="画面の切り替え"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => play("tap")}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[10px] transition-colors ${
                  active ? "text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                {active && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-accent" />}
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  {href === "/inbox" && unread > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-danger px-1 text-center font-mono text-[10px] leading-4 text-white">
                      {unread}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 右上のメニュー。タブに入らない画面と、退出 */
function MenuSheet({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const item = "flex min-h-14 w-full items-center gap-3 border-b border-line px-5 text-left text-sm hover:bg-raised";
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal aria-label="メニュー">
      <button type="button" aria-label="メニューを閉じる" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="glitch-in absolute right-0 top-0 h-full w-72 max-w-[85vw] border-l border-line bg-panel pt-[env(safe-area-inset-top)] shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-line px-5">
          <span className="text-sm font-bold">メニュー</span>
          <button type="button" onClick={onClose} aria-label="閉じる" className="-mr-2 flex h-11 w-11 items-center justify-center text-muted hover:text-foreground">
            <CloseIcon />
          </button>
        </div>
        <Link href="/id" onClick={onClose} className={item}>
          <IdIcon className="h-5 w-5 text-muted" />
          職員証
        </Link>
        <Link href="/about" onClick={onClose} className={item}>
          <DocIcon className="h-5 w-5 text-muted" />
          規約・ライセンス
        </Link>
        <button type="button" onClick={onLogout} className={`${item} text-danger`}>
          <ExitIcon className="h-5 w-5" />
          端末から退出する
        </button>
      </div>
    </div>
  );
}

/** 認証後の画面で共通の枠。上に紋章・効果音・メニューと端末の状態、下に画面を切り替えるタブを出す */
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
  const router = useRouter();
  const unread = useInbox().filter((mail) => !mail.read).length;
  const clearance = staff?.clearance;

  const [menuOpen, setMenuOpen] = useState(false);

  async function onLogout() {
    play("tap");
    await logout();
    router.replace("/");
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Emblem className="h-7 w-7 shrink-0 text-accent" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-bold text-foreground">統合観測ネットワーク</p>
            <p className="truncate text-[10px] text-muted">SCP財団 日本支部</p>
          </div>
          <SoundToggle />
          <button
            type="button"
            onClick={() => {
              play("tap");
              setMenuOpen(true);
            }}
            aria-label="メニューを開く"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-raised"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
        </div>
        {/* 端末の状態 */}
        <div className="border-t border-line/70 bg-background/60">
          <div className="mx-auto flex h-7 max-w-3xl items-center justify-between gap-3 px-4 font-mono text-[10px] text-muted">
            <span className="truncate">端末 {terminalId}</span>
            <span className="flex shrink-0 items-center gap-3">
              <span
                className={`rounded-sm px-1.5 leading-4 ${
                  clearance === "O5" ? "bg-danger/20 text-danger" : "bg-accent/15 text-accent"
                }`}
              >
                {clearance ? CLEARANCE_LABEL[clearance] : "確認中"}
              </span>
              <span className="tabular-nums">{clock}</span>
            </span>
          </div>
        </div>
      </header>
      {staff && <MailWatcher staff={staff} />}
      {menuOpen && <MenuSheet onClose={() => setMenuOpen(false)} onLogout={onLogout} />}
      <div
        className={
          bare
            ? "relative flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]"
            : "mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6"
        }
      >
        {children}
      </div>
      <TabBar unread={unread} />
    </div>
  );
}
