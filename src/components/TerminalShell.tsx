"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useModal } from "@/components/useModal.ts";
import { CLEARANCE_LABEL, logout, type Clearance } from "@/lib/client/session.ts";
import { setClearanceOverride, type StaffState } from "@/lib/client/progress.ts";
import { cctvTimestamp } from "@/lib/client/cctv.ts";
import { ensureProfile, syncMail, useInbox } from "@/lib/client/store.ts";
import { play } from "@/lib/client/sound.ts";
import { SoundToggle } from "@/components/SoundToggle.tsx";
import { CloseIcon, DocIcon, Emblem, ExitIcon, IdIcon, MailIcon } from "@/components/Icons.tsx";

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

/**
 * ヘッダーの時計(時:分)。描き直すのはこの部品だけにして、画面全体を毎秒描き直さないようにする。
 * 分が変わる時刻に合わせて更新する
 */
function Clock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const date = new Date();
      setNow(cctvTimestamp(date).slice(11, 16));
      timer = window.setTimeout(tick, 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds()) + 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return <span className="tabular-nums">{now || "--:--"}</span>;
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
      className="fixed inset-x-4 top-[max(6.25rem,calc(env(safe-area-inset-top)+5.75rem))] z-50 mx-auto flex max-w-md items-center gap-3 border-2 border-seal bg-panel px-4 py-2.5 shadow-[3px_3px_0_rgba(0,0,0,0.6)]"
    >
      <MailIcon className="h-4 w-4 shrink-0 text-seal-text" />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] font-bold tracking-wider text-seal-text">新着通達</span>
        <span className="block truncate text-sm font-bold text-foreground">{notice}</span>
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted">確認 &gt;</span>
    </Link>
  );
}

const NAV_ITEMS = [
  { href: "/portal", label: "業務トップ" },
  { href: "/scan", label: "観測" },
  { href: "/archive", label: "収容記録" },
  { href: "/library", label: "書庫" },
  { href: "/inbox", label: "受信箱" },
] as const;

/**
 * 画面下の操作帯。今いる画面は白黒反転で示す。指で押しやすいよう高さは 56px
 */
function BottomNav({ unread }: { unread: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="画面の切り替え"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line-strong bg-sunken pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5 divide-x divide-line border-x border-line">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = pathname.startsWith(href) || (href === "/archive" && pathname.startsWith("/database"));
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => play("tap")}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 items-center justify-center px-1 text-center transition-colors ${
                  active
                    ? "bg-foreground text-background shadow-[inset_0_2px_0_var(--seal)]"
                    : "bg-panel text-foreground hover:bg-raised shadow-[inset_0_-2px_0_rgba(0,0,0,0.45)]"
                }`}
              >
                <span className="truncate text-xs font-bold leading-none">
                  {label}
                  {href === "/inbox" && unread > 0 && (
                    <span className={active ? "ml-0.5 font-mono" : "ml-0.5 font-mono text-seal-text"}>({unread})</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** O5 で認証したときだけ出す、表示するクリアランスの切り替え(開発・確認用) */
function ClearanceSwitch({ current }: { current: Clearance }) {
  const levels: Clearance[] = ["L2", "L3", "L4", "O5"];
  return (
    <div className="border-b border-line px-4 py-4">
      <p className="font-mono text-[11px] font-bold text-foreground">表示クリアランス切替 (O5検証)</p>
      <p className="mt-1 text-[11px] leading-5 text-muted">画面上の閲覧制限のみ切り替えます。サーバー認証はO5のままです。</p>
      <div role="radiogroup" aria-label="表示するクリアランス" className="mt-3 grid grid-cols-4 border border-line-strong font-mono text-xs">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={current === level}
            onClick={() => {
              play("tap");
              setClearanceOverride(level === "O5" ? null : level);
            }}
            className={`min-h-10 border-r border-line-strong last:border-r-0 ${
              current === level ? "bg-foreground font-bold text-background" : "bg-sunken text-muted hover:text-foreground"
            }`}
          >
            {level === "O5" ? "O5" : `L${level.slice(1)}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 右上のシステムメニュー */
function MenuSheet({
  staff,
  terminalId,
  onClose,
  onLogout,
}: {
  staff?: StaffState;
  terminalId: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  const item = "flex min-h-12 w-full items-center gap-3 border-b border-line px-4 text-left text-sm hover:bg-raised";
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Escape で閉じる・Tab をメニューの中に留める・後ろの画面をスクロールさせない
  useModal(panelRef, onClose, closeRef);
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="端末メニュー">
      {/* 背景を押しても閉じる(キーボードでは Escape か「閉じる」を使うので、Tab の順番には入れない) */}
      <button type="button" tabIndex={-1} aria-hidden onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full w-72 max-w-[88vw] overflow-y-auto border-l-2 border-line-strong bg-panel pt-[env(safe-area-inset-top)]"
      >
        <div className="flex h-12 items-center justify-between border-b border-line-strong bg-sunken px-4">
          <span className="font-mono text-xs font-bold tracking-wider">端末メニュー</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="-mr-2 flex h-10 w-10 items-center justify-center text-muted hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-line bg-background px-4 py-3 font-mono text-[11px]">
          <dt className="text-muted">端末番号</dt>
          <dd className="text-right text-foreground">{terminalId}</dd>
          <dt className="text-muted">権限区分</dt>
          <dd className={`text-right font-bold ${staff?.clearance === "O5" ? "text-seal-text" : "text-foreground"}`}>
            {staff ? CLEARANCE_LABEL[staff.clearance] : "確認中"}
          </dd>
        </dl>
        <Link href="/id" onClick={onClose} className={item}>
          <IdIcon className="h-4 w-4 text-muted" />
          <span>職員証</span>
        </Link>
        <Link href="/about" onClick={onClose} className={item}>
          <DocIcon className="h-4 w-4 text-muted" />
          <span>規約・ライセンス</span>
        </Link>
        {staff?.server === "O5" && <ClearanceSwitch current={staff.clearance} />}
        <button type="button" onClick={onLogout} className={`${item} text-danger`}>
          <ExitIcon className="h-4 w-4" />
          <span>端末から退出する</span>
        </button>
      </div>
    </div>
  );
}

/** 認証後の画面で共通の枠。上に業務システムのヘッダー帯と状態欄、下に画面切替バーを出す */
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
  const router = useRouter();
  const unread = useInbox(staff?.server).filter((mail) => !mail.read).length;
  const clearance = staff?.clearance;

  const [menuOpen, setMenuOpen] = useState(false);

  async function onLogout() {
    play("tap");
    await logout();
    router.replace("/");
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background">
      <header className="sticky top-0 z-30 border-b-2 border-line-strong bg-panel pt-[env(safe-area-inset-top)]">
        {/* 上段: 機関名と現在の画面番号 */}
        <div className="mx-auto flex h-11 max-w-3xl items-center justify-between gap-3 border-x border-line px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Emblem className="h-5 w-5 shrink-0 text-foreground" />
            <p className="truncate font-doc text-[13px] font-bold tracking-wide text-foreground sm:text-[14px]">
              SCP財団 日本支部 <span className="text-muted">／</span> 統合観測ネットワーク
            </p>
          </div>
          {screen && (
            <div className="flex shrink-0 items-center gap-2 border border-line-strong bg-sunken px-2 py-0.5 font-mono text-[10px] leading-none">
              <span className="text-muted">{screen.id}</span>
              <span className="text-foreground">{screen.name}</span>
            </div>
          )}
        </div>
        {/* 下段: 縦罫線で区切ったステータス欄と機器スイッチ */}
        <div className="border-t border-line bg-sunken">
          <div className="mx-auto flex h-10 max-w-3xl items-center justify-between gap-2 border-x border-line px-3 font-mono text-[10px] text-muted sm:px-4">
            <div className="flex min-w-0 flex-1 items-center divide-x divide-line overflow-hidden">
              <span className="truncate pr-2.5">端末:{terminalId}</span>
              <span className="shrink-0 px-2.5">
                <span className={clearance === "O5" ? "font-bold text-seal-text" : "text-foreground"}>
                  {clearance ? CLEARANCE_LABEL[clearance] : "確認中"}
                </span>
                {staff?.overridden && <span className="ml-1 text-seal-text">[O5切替]</span>}
              </span>
              <span className="hidden shrink-0 pl-2.5 sm:inline">
                <Clock />
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SoundToggle />
              <button
                type="button"
                onClick={() => {
                  play("tap");
                  setMenuOpen(true);
                }}
                aria-label="端末メニューを開く"
                className="flex h-7 items-center border border-line-strong bg-raised px-2.5 font-ui text-[11px] font-bold text-foreground hover:bg-[#2d2b27]"
              >
                メニュー
              </button>
            </div>
          </div>
        </div>
      </header>
      {staff && <MailWatcher staff={staff} />}
      {menuOpen && <MenuSheet staff={staff} terminalId={terminalId} onClose={() => setMenuOpen(false)} onLogout={onLogout} />}
      <div
        className={
          bare
            ? "relative flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))]"
            : "mx-auto flex w-full max-w-3xl flex-1 flex-col border-x border-line/60 bg-background px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6"
        }
      >
        {children}
      </div>
      <BottomNav unread={unread} />
    </div>
  );
}
