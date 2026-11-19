"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CLEARANCE_LABEL, fetchClearance, type Clearance } from "@/lib/client/session.ts";

type Line = { text: string; tone?: "muted" | "accent" | "warn" | "danger" };

const BOOT: Line[] = [
  { text: "SCP FOUNDATION / 日本支部 統合観測ネットワーク", tone: "accent" },
  { text: "端末起動 ............................ 完了", tone: "muted" },
  { text: "暗号化回線の確立 .................... 完了", tone: "muted" },
  { text: "ミーム汚染フィルタ .................. 有効", tone: "muted" },
  { text: "観測モジュール CCTV-81 .............. 待機", tone: "muted" },
  { text: "" },
  { text: "本端末は財団職員専用です。権限のない閲覧・操作はすべて記録され、処分の対象となります。", tone: "warn" },
];

/** 失敗回数ごとの応答。回数が増えるほど物騒になる */
function failureLines(count: number): Line[] {
  if (count <= 1) return [{ text: "認証コードが一致しません。", tone: "danger" }];
  if (count === 2) return [{ text: `認証コードが一致しません。不一致を記録しました(${count}/5)。`, tone: "danger" }];
  if (count === 3)
    return [
      { text: "警告: 連続した認証失敗を検知しました。", tone: "danger" },
      { text: "本端末の操作は保安部門により監視されています。", tone: "warn" },
    ];
  if (count === 4) return [{ text: "警告: 次の失敗で本端末をロックします。", tone: "danger" }];
  return [
    { text: "不正アクセスを検知しました。", tone: "danger" },
    { text: "記憶処理班が現在地に向かっています。その場を動かないでください。", tone: "danger" },
  ];
}

const LOCK_SECONDS = 15;
const FAIL_KEY = "scp-auth-failures";

function readFailures(): number {
  try {
    return Number(sessionStorage.getItem(FAIL_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function writeFailures(value: number) {
  try {
    sessionStorage.setItem(FAIL_KEY, String(value));
  } catch {
    // 保存できなくても動作には影響しない
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TONE_CLASS: Record<NonNullable<Line["tone"]>, string> = {
  muted: "text-muted",
  accent: "text-accent glow",
  warn: "text-warn",
  danger: "text-danger",
};

export function AuthTerminal({ codeHint }: { codeHint?: { level2: string; o5: string } }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [booted, setBooted] = useState(false);
  const [existing, setExisting] = useState<Clearance | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const push = (...next: Line[]) => setLines((prev) => [...prev, ...next]);

  // 起動シーケンス
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const clearancePromise = fetchClearance();
      for (const line of BOOT) {
        await wait(line.text ? 140 : 60);
        if (cancelled) return;
        setLines((prev) => [...prev, line]);
      }
      const clearance = await clearancePromise;
      if (cancelled) return;
      setExisting(clearance);
      setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (booted && !existing) inputRef.current?.focus();
  }, [booted, existing]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  // ロック中のカウントダウン
  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = setTimeout(() => setLockedFor((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [lockedFor]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || lockedFor > 0 || !code.trim()) return;
    setBusy(true);
    push({ text: `> 職員認証コード: ${"*".repeat(code.length)}`, tone: "muted" }, { text: "照合中 ...", tone: "muted" });

    let clearance: Clearance | null = null;
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json()) as { ok: boolean; clearance?: Clearance };
      clearance = body.ok && body.clearance ? body.clearance : null;
    } catch {
      push({ text: "通信エラー: 財団回線に接続できません。", tone: "danger" });
      setBusy(false);
      return;
    }

    setCode("");
    if (!clearance) {
      const failures = readFailures() + 1;
      writeFailures(failures);
      push(...failureLines(failures));
      if (failures >= 5) {
        setLockedFor(LOCK_SECONDS);
        writeFailures(3);
      }
      setBusy(false);
      return;
    }

    writeFailures(0);
    push({ text: "認証完了。", tone: "accent" });
    if (clearance === "O5") {
      await wait(500);
      push(
        { text: "警告: O5評議会権限を検出しました。", tone: "danger" },
        { text: "全記録の閲覧制限を解除します。", tone: "danger" },
      );
    } else {
      await wait(400);
      push({ text: `クリアランス ${CLEARANCE_LABEL[clearance]} を付与しました。`, tone: "accent" });
    }
    await wait(700);
    push({ text: "観測端末を起動します ...", tone: "muted" });
    await wait(900);
    router.push("/scan");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 text-sm leading-7">
      <div className="flex-1 space-y-0.5">
        {lines.map((line, index) => (
          <p key={index} className={`glitch-in whitespace-pre-wrap ${line.tone ? TONE_CLASS[line.tone] : ""}`}>
            {line.text || " "}
          </p>
        ))}

        {booted && existing && (
          <div className="glitch-in mt-6 space-y-4">
            <p className="text-accent glow">
              職員認証済みの端末です(クリアランス {CLEARANCE_LABEL[existing]})。
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/scan")}
                className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background"
              >
                観測を開始する
              </button>
              <button
                type="button"
                onClick={() => setExisting(null)}
                className="border border-line px-4 py-2 text-muted hover:text-foreground"
              >
                別のコードで認証する
              </button>
            </div>
          </div>
        )}

        {booted && !existing && (
          <form onSubmit={onSubmit} className="glitch-in mt-6">
            <label htmlFor="code" className="block text-muted">
              職員認証コードを入力してください
            </label>
            <div className="mt-1 flex items-center gap-2 border-b border-line focus-within:border-accent">
              <span className="text-accent">&gt;</span>
              <input
                ref={inputRef}
                id="code"
                type="password"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={code}
                disabled={busy || lockedFor > 0}
                onChange={(event) => setCode(event.target.value)}
                className="w-full bg-transparent py-2 text-foreground outline-none placeholder:text-muted/50 disabled:opacity-50"
                placeholder={lockedFor > 0 ? `端末ロック中 ... ${lockedFor}` : ""}
              />
            </div>
            <button type="submit" className="sr-only">
              認証
            </button>
          </form>
        )}
        <div ref={endRef} />
      </div>

      {/* TODO(仮): 確認用の合言葉メモ。あとで消す */}
      {codeHint && (codeHint.level2 || codeHint.o5) && (
        <aside className="mt-10 border border-dashed border-warn/60 px-3 py-2 text-xs leading-6 text-warn">
          <p>[仮] 確認用の合言葉</p>
          {codeHint.level2 && <p>レベル2: {codeHint.level2}</p>}
          {codeHint.o5 && <p>O5: {codeHint.o5}</p>}
        </aside>
      )}

      <footer className="mt-10 text-xs text-muted">
        <Link href="/about" className="underline hover:text-foreground">
          規約・ライセンス
        </Link>
      </footer>
    </main>
  );
}
