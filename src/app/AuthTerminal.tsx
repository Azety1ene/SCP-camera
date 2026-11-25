"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { CLEARANCE_LABEL, fetchClearance, rememberClearance, type Clearance, type ServerClearance } from "@/lib/client/session.ts";
import { resolveClearance, setClearanceOverride } from "@/lib/client/progress.ts";
import { play, unlockAudio } from "@/lib/client/sound.ts";
import { SoundToggle } from "@/components/SoundToggle.tsx";
import { Emblem } from "@/components/Icons.tsx";

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
  { kind: "plain", text: "SCP FOUNDATION JAPAN / 統合観測ネットワーク 端末OS v2.4", tone: "accent" },
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

/** 起動シーケンスを最後まで見たことがあるか。2回目以降はスキップの案内を出す */
const BOOT_SEEN_KEY = "scp-boot-seen";

const subscribeNothing = () => () => {};

function readBootSeen(): boolean {
  try {
    return localStorage.getItem(BOOT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeBootSeen() {
  try {
    localStorage.setItem(BOOT_SEEN_KEY, "1");
  } catch {
    // 保存できなくても、毎回フルで表示されるだけ
  }
}

const TONE_CLASS: Record<NonNullable<Line["tone"]>, string> = {
  muted: "text-muted",
  accent: "text-accent",
  warn: "text-warn",
  danger: "text-danger",
};

export function AuthTerminal() {
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
  const skipRef = useRef(false);
  // サーバーでは localStorage を読めないので false として描き、ブラウザで読み直す
  const returning = useSyncExternalStore(subscribeNothing, readBootSeen, () => false);
  const skipOutroRef = useRef(false);
  const [outro, setOutro] = useState(false);

  const push = (...next: Line[]) => setLines((prev) => [...prev, ...next]);
  const updateLast = (patch: (line: Line) => Partial<Line>) =>
    setLines((prev) => (prev.length ? [...prev.slice(0, -1), { ...prev[prev.length - 1], ...patch(prev[prev.length - 1]) }] : prev));

  // 起動シーケンス: 状態の行は「…」を伸ばしてから少し間を置いて結果を出し、警告文は1文字ずつ打つ
  useEffect(() => {
    if (!powered) return;
    let cancelled = false;
    const pause = (ms: number) => (skipRef.current || cancelled ? Promise.resolve() : wait(ms));

    (async () => {
      const clearancePromise = fetchClearance().then((server) => (server ? resolveClearance(server) : null));
      await pause(280);
      for (const step of BOOT) {
        if (cancelled || skipRef.current) break;
        if (step.kind === "plain") {
          push({ text: step.text, tone: step.tone });
          await pause(400);
        } else if (step.kind === "blank") {
          push({ text: "" });
          await pause(220);
        } else if (step.kind === "status") {
          push({ text: `${step.label} `, tone: "muted" });
          for (let i = 0; i < dotsFor(step.label); i++) {
            if (skipRef.current) break;
            await pause(14);
            updateLast((line) => ({ text: `${line.text}.` }));
          }
          await pause(randomBetween(320, 820));
          updateLast((line) => ({ text: `${line.text} `, status: step.status, statusTone: step.statusTone }));
          if (!skipRef.current) play("ok");
          await pause(110);
        } else {
          push({ text: "", tone: step.tone, typing: true });
          for (const ch of step.text) {
            if (skipRef.current) break;
            updateLast((line) => ({ text: line.text + ch }));
            if (ch.trim()) play("key");
            await pause("。、".includes(ch) ? 200 : randomBetween(26, 55));
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
      writeBootSeen();
    })();

    return () => {
      cancelled = true;
    };
  }, [powered]);

  // 2回目以降の起動だけ、画面を2回タップすると(PCでは Enter / Space / Esc でも)演出を飛ばす
  useEffect(() => {
    if (!powered || !returning) return;
    let lastTap = 0;
    const skip = () => {
      skipRef.current = true;
      skipOutroRef.current = true;
    };
    const onPointer = () => {
      const now = Date.now();
      if (now - lastTap < 400) skip();
      lastTap = now;
    };
    const onKey = (event: KeyboardEvent) => {
      if (["Enter", " ", "Escape"].includes(event.key) && (!booted || outro)) skip();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [powered, returning, booted, outro]);

  useEffect(() => {
    if (booted && !existing) inputRef.current?.focus();
  }, [booted, existing]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

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

    let server: ServerClearance | null = null;
    try {
      const [res] = await Promise.all([
        fetch("/api/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        }),
        wait(700),
      ]);
      if (res.status === 429) {
        const retryAfter = Math.min(600, Math.max(1, Number(res.headers.get("retry-after")) || LOCK_SECONDS));
        setCode("");
        push(
          { text: "照合要求が上限を超えました。", tone: "danger" },
          { text: `セキュリティ規定により、この回線からの認証を約${Math.ceil(retryAfter / 60)}分間停止します。`, tone: "warn" },
        );
        play("deny");
        setLockedFor(retryAfter);
        setBusy(false);
        return;
      }
      const body = (await res.json()) as { ok: boolean; clearance?: ServerClearance };
      server = body.ok && body.clearance ? body.clearance : null;
      if (server) rememberClearance(server);
    } catch {
      push({ text: "通信エラー: 財団回線に接続できません。", tone: "danger" });
      setBusy(false);
      return;
    }

    setCode("");
    if (server) setClearanceOverride(null);
    const clearance: Clearance | null = server ? await resolveClearance(server) : null;
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
    setOutro(true);
    const outroWait = (ms: number) => (skipOutroRef.current ? Promise.resolve() : wait(ms));
    push({ text: "認証完了。", tone: "accent" });
    play("granted");
    if (clearance === "O5") {
      await outroWait(500);
      push(
        { text: "警告: O5評議会権限を検出しました。", tone: "danger" },
        { text: "全記録の閲覧制限を解除します。", tone: "danger" },
      );
    } else {
      await outroWait(400);
      push({ text: `クリアランス ${CLEARANCE_LABEL[clearance]} を付与しました。`, tone: "accent" });
    }
    await outroWait(700);
    push({ text: "観測端末を起動します ...", tone: "muted" });
    await outroWait(900);
    router.push("/portal");
  }

  // 共通の上部機器バー
  const topBar = (screenId: string, screenName: string) => (
    <header className="border-b-2 border-line-strong bg-panel pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-11 max-w-2xl items-center justify-between gap-3 border-x border-line px-4">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-muted">
          <span className="border border-line-strong bg-sunken px-1.5 py-0.5 text-[10px] text-foreground">{screenId}</span>
          <span className="truncate">{screenName}</span>
        </div>
        <SoundToggle />
      </div>
    </header>
  );

  if (!powered) {
    return (
      <div className="flex min-h-dvh flex-1 flex-col bg-background">
        {topBar("SYS-0000", "電源待機")}
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center border-x border-line/60 px-4 py-10 sm:px-8">
          {/* 支給端末の銘板・起動前確認票 */}
          <section className="border-2 border-line-strong bg-panel">
            <div className="flex items-center justify-between border-b border-line-strong bg-sunken px-4 py-2.5 font-mono text-[11px] text-muted">
              <span>SCP FOUNDATION / JAPAN BRANCH</span>
              <span>型式 81-OT</span>
            </div>
            <div className="space-y-6 p-5 sm:p-7">
              <div className="flex items-start gap-4 border-b border-line pb-5">
                <Emblem className="mt-0.5 h-10 w-10 shrink-0 text-foreground" />
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-muted">記録・情報保安管理局 支給機材</p>
                  <h1 className="mt-1 font-doc text-xl font-bold leading-snug text-foreground sm:text-2xl">
                    統合観測ネットワーク 端末
                  </h1>
                </div>
              </div>

              <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 border border-line bg-sunken px-3.5 py-3 font-mono text-xs">
                <dt className="text-muted">回線状態</dt>
                <dd className="text-foreground">待機中(未通電)</dd>
                <dt className="text-muted">音声出力</dt>
                <dd className="text-foreground">有効(右上のスイッチで切替可)</dd>
                <dt className="text-muted">利用区分</dt>
                <dd className="text-warn">財団職員専用 ── 認証コード必須</dd>
              </dl>

              <p className="text-xs leading-6 text-muted">
                本端末は財団日本支部の観測記録業務に支給された専用機器です。起動後の操作はすべて記録されます。
              </p>

              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  play("power");
                  setPowered(true);
                }}
                className="btn btn-primary btn-lg w-full font-mono"
              >
                端末を起動する
              </button>
            </div>
            <div className="flex items-center justify-between border-t border-line bg-sunken px-4 py-2 font-mono text-[11px] text-muted">
              <span>確保・収容・保護</span>
              <Link href="/about" className="underline hover:text-foreground">
                規約・ライセンス
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background">
      {topBar("SYS-0010", "職員認証")}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col border-x border-line/60 px-4 py-6 sm:px-6">
        {returning && (!booted || outro) && (
          <p className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-10 border border-line-strong bg-panel px-2.5 py-1 font-mono text-[11px] text-muted">
            画面を2回タップでスキップ
          </p>
        )}

        {/* コンソール出力枠 */}
        <div className="flex-1 border border-line-strong bg-sunken p-4 font-mono text-[13px] leading-7 sm:p-5">
          <div className="space-y-0.5">
            {lines.map((line, index) => (
              <p
                key={index}
                className={`whitespace-pre-wrap break-words ${line.tone ? TONE_CLASS[line.tone] : ""} ${line.typing ? "cursor" : ""}`}
              >
                {line.text || " "}
                {line.status && <span className={line.statusTone ? TONE_CLASS[line.statusTone] : "text-foreground"}>{line.status}</span>}
              </p>
            ))}
          </div>

          {booted && existing && (
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-accent">
                職員認証済みの端末です(クリアランス {CLEARANCE_LABEL[existing]})。
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    play("tap");
                    router.push("/portal");
                  }}
                  className="btn btn-primary"
                >
                  業務画面に入る
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
            <form onSubmit={onSubmit} className="mt-6 border-t border-line pt-5 font-ui">
              <label htmlFor="code" className="block font-mono text-xs text-foreground">
                職員認証コード
              </label>
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
                className="field-input mt-2"
                placeholder={lockedFor > 0 ? `端末ロック中 ... ${lockedFor}秒` : "認証コードを入力"}
                enterKeyHint="go"
              />
              <button
                type="submit"
                disabled={busy || lockedFor > 0 || !code.trim()}
                className="btn btn-primary btn-lg mt-4 w-full"
              >
                {busy ? "照合中 …" : lockedFor > 0 ? `端末ロック中(${lockedFor}秒)` : "認証を実行する"}
              </button>
            </form>
          )}
          <div ref={endRef} />
        </div>

        <footer className="mt-4 flex items-center justify-between font-mono text-[11px] text-muted">
          <span>SCP財団 日本支部</span>
          <Link href="/about" className="underline hover:text-foreground">
            規約・ライセンス
          </Link>
        </footer>
      </main>
    </div>
  );
}
