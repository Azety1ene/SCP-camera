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
import { CloseIcon, DocIcon, Emblem, ExitIcon, IdIcon, MailIcon, MenuIcon } from "@/components/Icons.tsx";

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
      className="fixed inset-x-4 top-[max(6.5rem,calc(env(safe-area-inset-top)+6rem))] z-50 mx-auto flex max-w-sm items-center gap-3 border border-foreground/40 bg-raised px-4 py-3 shadow-xl"
    >
      <MailIcon className="h-5 w-5 shrink-0 text-seal" />
      <span className="min-w-0">
        <span className="block text-[11px] font-bold text-seal">新着メール</span>
        <span className="block truncate text-sm text-foreground">{notice}</span>
      </span>
    </Link>
  );
}

const KEYS = [
  { key: "F1", href: "/portal", label: "ポータル" },
  { key: "F2", href: "/scan", label: "観測" },
  { key: "F3", href: "/archive", label: "収容記録" },
  { key: "F4", href: "/library", label: "書庫" },
  { key: "F5", href: "/inbox", label: "受信箱" },
] as const;

/**
 * 画面下のファンクションキーの帯(業務端末の画面を参照)。
 * 今いる画面のキーは白黒反転で示す。指で押しやすいよう、1つのキーの高さは 56px
 */
function FunctionKeys({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="画面の切り替え"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5 gap-px bg-line">
        {KEYS.map(({ key, href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href} className="bg-background">
              <Link
                href={href}
                onClick={() => play("tap")}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 ${
                  active ? "bg-foreground text-[#111416]" : "text-foreground hover:bg-raised"
                }`}
              >
                <span className={`font-mono text-[10px] ${active ? "text-[#111416]/60" : "text-muted"}`}>{key}</span>
                <span className="text-[11px] font-bold leading-none">
                  {label}
                  {href === "/inbox" && unread > 0 && <span className={active ? "" : "text-seal"}>({unread})</span>}
                </span>
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
      <div className="absolute right-0 top-0 h-full w-72 max-w-[85vw] border-l border-line bg-panel pt-[env(safe-area-inset-top)] shadow-2xl">
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

/** 認証後の画面で共通の枠。上に画面ID と端末の状態、下にファンクションキーの帯を出す(業務端末の画面を参照) */
export type ScreenInfo = { id: string; name: string };

export function TerminalShell({
  staff,
  screen,
  children,
  bare = false,
}: {
  staff?: StaffState;
  /** 業務システムの画面ID と画面名。上部に表示する */
  screen?: ScreenInfo;
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
      <header className="sticky top-0 z-30 border-b border-line bg-panel pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-3 px-4">
          <Emblem className="h-6 w-6 shrink-0 text-foreground" />
          <p className="min-w-0 flex-1 truncate font-doc text-[14px] font-bold text-foreground">統合観測ネットワーク</p>
          {screen && (
            <p className="shrink-0 text-right font-mono text-[10px] leading-tight text-muted">
              {screen.id}
              <br />
              <span className="text-foreground">{screen.name}</span>
            </p>
          )}
        </div>
        <div className="border-t border-line bg-background">
          <div className="mx-auto flex h-11 max-w-3xl items-center gap-3 px-4 font-mono text-[10px] text-muted">
            <span className="min-w-0 flex-1 truncate">
              端末 {terminalId}
              <span className="mx-1.5 text-line">|</span>
              <span className={clearance === "O5" ? "text-seal" : "text-accent"}>{clearance ? CLEARANCE_LABEL[clearance] : "確認中"}</span>
              <span className="mx-1.5 text-line">|</span>
              <span className="tabular-nums">{clock.slice(11, 16)}</span>
            </span>
            <SoundToggle />
            <button
              type="button"
              onClick={() => {
                play("tap");
                setMenuOpen(true);
              }}
              aria-label="メニューを開く"
              className="-mr-2 flex h-10 w-10 items-center justify-center text-foreground hover:bg-raised"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      {staff && <MailWatcher staff={staff} />}
      {menuOpen && <MenuSheet onClose={() => setMenuOpen(false)} onLogout={onLogout} />}
      <div
        className={
          bare
            ? "relative flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))]"
            : "mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6"
        }
      >
        {children}
      </div>
      <FunctionKeys unread={unread} />
    </div>
  );
}
