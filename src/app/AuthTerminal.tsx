"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CLEARANCE_LABEL, fetchClearance, type ServerClearance as Clearance } from "@/lib/client/session.ts";
import { play, unlockAudio } from "@/lib/client/sound.ts";
import { SoundToggle } from "@/components/SoundToggle.tsx";

type Tone = "muted" | "accent" | "warn" | "danger";

type Line = {
  text: string;
  tone?: Tone;
  /** 行末に後から表示する状態(「完了」など) */
  status?: string;
  statusTone?: Tone;
  /** 1文字ずつ表示している途中 */
  typing?: boolean;
};

/** 起動シーケンスの手順 */
type BootStep =
  | { kind: "plain"; text: string; tone?: Tone }
  | { kind: "status"; label: string; status: string; statusTone?: Tone }
  | { kind: "blank" }
  | { kind: "typed"; text: string; tone?: Tone };

const BOOT: BootStep[] = [
  { kind: "plain", text: "SCP FOUNDATION / 日本支部 統合観測ネットワーク", tone: "accent" },
  { kind: "status", label: "端末起動", status: "完了" },
  { kind: "status", label: "暗号化回線の確立", status: "完了" },
  { kind: "status", label: "ミーム汚染フィルタ", status: "有効", statusTone: "accent" },
  { kind: "status", label: "観測モジュール CCTV-81", status: "待機", statusTone: "warn" },
  { kind: "blank" },
  {
    kind: "typed",
    text: "本端末は財団職員専用です。権限のない閲覧・操作はすべて記録され、処分の対象となります。",
    tone: "warn",
  },
];

/** 状態の文字がそろう桁(全角は2桁として数える) */
const STATUS_COLUMN = 36;

function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += ch.charCodeAt(0) > 0xff ? 2 : 1;
  return width;
}

function dotsFor(label: string): number {
  return Math.max(3, STATUS_COLUMN - displayWidth(label) - 2);
}

/** 起動シーケンスを飛ばしたときに表示する、完成した状態 */
function finishedBootLines(): Line[] {
  return BOOT.map((step): Line => {
    switch (step.kind) {
      case "plain":
        return { text: step.text, tone: step.tone };
      case "status":
        return { text: `${step.label} ${".".repeat(dotsFor(step.label))} `, tone: "muted", status: step.status, statusTone: step.statusTone };
      case "blank":
        return { text: "" };
      case "typed":
        return { text: step.text, tone: step.tone };
    }
  });
}

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

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
  /** 「端末を起動する」を押したか。音を鳴らすには、最初に画面に触れてもらう必要がある */
  const [powered, setPowered] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [booted, setBooted] = useState(false);
  const [existing, setExisting] = useState<Clearance | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  /** 画面をタップするかキーを押すと、起動シーケンスを飛ばす */
  const skipRef = useRef(false);

  const push = (...next: Line[]) => setLines((prev) => [...prev, ...next]);
  const updateLast = (patch: (line: Line) => Partial<Line>) =>
    setLines((prev) => (prev.length ? [...prev.slice(0, -1), { ...prev[prev.length - 1], ...patch(prev[prev.length - 1]) }] : prev));

  // 起動シーケンス: 状態の行は「…」を伸ばしてから少し間を置いて結果を出し、警告文は1文字ずつ打つ
  useEffect(() => {
    if (!powered) return;
    let cancelled = false;
    const pause = (ms: number) => (skipRef.current || cancelled ? Promise.resolve() : wait(ms));

    (async () => {
      const clearancePromise = fetchClearance();
      await pause(300);
      for (const step of BOOT) {
        if (cancelled || skipRef.current) break;
        if (step.kind === "plain") {
          push({ text: step.text, tone: step.tone });
          await pause(450);
        } else if (step.kind === "blank") {
          push({ text: "" });
          await pause(250);
        } else if (step.kind === "status") {
          push({ text: `${step.label} `, tone: "muted" });
          for (let i = 0; i < dotsFor(step.label); i++) {
            if (skipRef.current) break;
            await pause(14);
            updateLast((line) => ({ text: `${line.text}.` }));
          }
          // 処理しているように、結果が出るまで少し待つ
          await pause(randomBetween(350, 900));
          updateLast((line) => ({ text: `${line.text} `, status: step.status, statusTone: step.statusTone }));
          if (!skipRef.current) play("ok");
          await pause(120);
        } else {
          push({ text: "", tone: step.tone, typing: true });
          for (const ch of step.text) {
            if (skipRef.current) break;
            updateLast((line) => ({ text: line.text + ch }));
            if (ch.trim()) play("key");
            await pause("。、".includes(ch) ? 220 : randomBetween(28, 60));
          }
          updateLast(() => ({ typing: false }));
        }
      }
      if (cancelled) return;
      if (skipRef.current) setLines(finishedBootLines());
      const clearance = await clearancePromise;
      if (cancelled) return;
      setExisting(clearance);
      setBooted(true);
    })();

    const skip = () => {
      skipRef.current = true;
    };
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, [powered]);

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
      play("deny");
      if (failures >= 5) {
        setLockedFor(LOCK_SECONDS);
        writeFailures(3);
      }
      setBusy(false);
      return;
    }

    writeFailures(0);
    push({ text: "認証完了。", tone: "accent" });
    play("granted");
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
    router.push("/portal");
  }

  if (!powered) {
    return (
      <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center font-mono text-sm leading-7">
        <SoundToggle className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] text-xs text-muted" />
        <div className="space-y-1">
          <p className="text-xs tracking-[0.3em] text-muted">SECURE ・ CONTAIN ・ PROTECT</p>
          <p className="text-accent glow">SCP財団 統合観測端末</p>
        </div>
        <button
          type="button"
          onClick={() => {
            unlockAudio();
            play("power");
            setPowered(true);
          }}
          className="btn btn-primary btn-lg min-w-64 font-mono tracking-widest"
        >
          <span className="cursor">[ 端末を起動する ]</span>
        </button>
        <p className="text-xs text-muted">この端末は音が出ます。右上で切り替えられます。</p>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 font-mono text-sm leading-7">
      <SoundToggle className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] text-xs text-muted" />
      <div className="flex-1 space-y-0.5">
        {lines.map((line, index) => (
          <p
            key={index}
            className={`glitch-in whitespace-pre-wrap ${line.tone ? TONE_CLASS[line.tone] : ""} ${line.typing ? "cursor" : ""}`}
          >
            {line.text || " "}
            {line.status && <span className={`glitch-in ${line.statusTone ? TONE_CLASS[line.statusTone] : "text-foreground"}`}>{line.status}</span>}
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
                onClick={() => {
                  play("tap");
                  router.push("/portal");
                }}
                className="btn btn-primary"
              >
                端末に入る
              </button>
              <button
                type="button"
                onClick={() => setExisting(null)}
                className="btn btn-secondary"
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
                enterKeyHint="go"
              />
            </div>
            <button
              type="submit"
              disabled={busy || lockedFor > 0 || !code.trim()}
              className="btn btn-primary btn-lg mt-5 w-full"
            >
              {busy ? "照合中 …" : lockedFor > 0 ? `端末ロック中(${lockedFor})` : "認証する"}
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
