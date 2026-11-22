"use client";

import { exportImage } from "@/lib/client/exportImage.ts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { ReportDocument } from "@/components/report/ReportDocument.tsx";
import { deleteRecord, getRecord, updateRecord, type ContainmentRecord } from "@/lib/client/db.ts";
import { useStaff } from "@/lib/client/progress.ts";
import { useObjectUrl } from "@/lib/client/useObjectUrl.ts";
import { play } from "@/lib/client/sound.ts";
import { forgetPhoto, photoBytes } from "@/lib/client/upload-cache.ts";
import { setRating, useRatings } from "@/lib/client/store.ts";
import type { GeneratedReport } from "@/lib/report/schema.ts";

/** 照会中に順に流す処理ログ(実際の処理とは対応していない演出) */
const QUERY_STEPS = [
  "記録画像を受信しました",
  "画像の完全性を検証中 ... 完了",
  "形態の解析を開始",
  "既知の収容物データベースと照合中",
  "類似事例: 該当なし",
  "新規アイテム番号を割り当て中",
  "異常性の評価中",
  "特別収容プロトコルを起案中",
  "倫理委員会に照会中",
  "記録の一部に閲覧制限を適用中",
];

/** 同じ記録を二重に生成しないため(画面が描き直されても、照会は1件につき1回) */
const inFlight = new Set<string>();

/** 記録が更新されたことを、表示中の画面に知らせるイベント */
const RECORD_EVENT = "scp-record-change";

function announce(id: string) {
  window.dispatchEvent(new CustomEvent(RECORD_EVENT, { detail: id }));
}

/**
 * 照会(報告書の生成)。結果は IndexedDB に書き、イベントで知らせる。
 * 画面のコンポーネントの外で動かすので、画面が作り直されても結果を取りこぼさない。
 */
async function runQuery(current: ContainmentRecord) {
  if (inFlight.has(current.id)) return;
  inFlight.add(current.id);
  await updateRecord(current.id, {
    status: "pending",
    requestedAt: Date.now(),
    attempts: (current.attempts ?? 0) + 1,
    error: undefined,
  });
  announce(current.id);

  let patch: Partial<ContainmentRecord>;
  try {
    // 写真のデータを先に読み出しておく(保存先の Blob をそのまま送ると、iPhone で送信に失敗することがある)
    let bytes: ArrayBuffer;
    try {
      bytes = await photoBytes(current.id, current.photo);
    } catch (error) {
      throw new QueryError("read", error);
    }
    const res = await postWithRetry(bytes);
    let body: GenerateResponse | null = null;
    try {
      body = (await res.json()) as GenerateResponse;
    } catch {
      body = null;
    }
    if (!body) {
      patch = { status: "error", error: { code: `http_${res.status}`, message: "財団回線から不正な応答を受信しました。" } };
    } else if ("error" in body) {
      patch = { status: "error", error: body.error };
    } else {
      patch = { status: "done", itemNumber: body.itemNumber, tone: body.tone, report: body.report };
    }
  } catch (error) {
    // 原因を突き止められるよう、ブラウザが返した理由もエラーコードに含める
    const stage = error instanceof QueryError ? error.stage : "network";
    const cause = error instanceof QueryError ? error.cause : error;
    const reason = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
    console.error("[query]", stage, cause);
    patch = {
      status: "error",
      error: {
        code: `${stage} / ${reason}`.slice(0, 120),
        message: stage === "read" ? "記録画像を読み出せませんでした。" : "財団回線との接続が切断されました。",
      },
    };
  } finally {
    inFlight.delete(current.id);
  }
  if (patch.status === "done") forgetPhoto(current.id);
  await updateRecord(current.id, patch);
  announce(current.id);
  play(patch.status === "done" ? "complete" : "deny");
}

class QueryError extends Error {
  constructor(
    readonly stage: "read" | "network",
    readonly cause: unknown,
  ) {
    super(stage);
  }
}

/** 送信する。通信そのものに失敗したら、少し待って1回だけ送り直す */
async function postWithRetry(bytes: ArrayBuffer): Promise<Response> {
  const send = () => {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/jpeg" }), "capture.jpg");
    return fetch("/api/generate", { method: "POST", body: form });
  };
  try {
    return await send();
  } catch (first) {
    console.warn("[query] 送信に失敗したので送り直します", first);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      return await send();
    } catch (second) {
      throw new QueryError("network", second);
    }
  }
}

type GenerateResponse =
  | { itemNumber: string; tone: string; report: GeneratedReport }
  | { error: { code: string; message: string } };

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function QueryLog({ startedAt, photoUrl }: { startedAt: number; photoUrl: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = now - startedAt;
  // 7秒ごとに1行ずつ進める
  const shown = Math.min(QUERY_STEPS.length, 1 + Math.floor(elapsed / 7000));

  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_1.2fr]">
      <div className="relative overflow-hidden border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- IndexedDB の Blob を表示するため */}
        <img src={photoUrl} alt="照会中の記録画像" className="w-full" />
        <div aria-hidden className="sweep absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-transparent via-accent/25 to-transparent" />
      </div>
      <div className="text-sm leading-7">
        <p className="font-bold text-accent">財団データベースに照会中</p>
        <p className="mb-3 text-xs text-muted">経過 {formatElapsed(elapsed)} ／ 照会には数分かかることがあります。この画面を開いたままお待ちください。</p>
        {QUERY_STEPS.slice(0, shown).map((step) => (
          <p key={step} className="glitch-in text-muted">
            &gt; {step}
          </p>
        ))}
        <p className="cursor mt-1 text-foreground">{shown >= QUERY_STEPS.length ? "> 照会を継続中" : ""}</p>
      </div>
    </div>
  );
}

/** Wiki の評価モジュールに倣った「好き / 好きじゃない」 */
function RatingBox({ recordId }: { recordId: string }) {
  const value = useRatings()[recordId] ?? 0;
  const toggle = (next: 1 | -1) => {
    play("tap");
    setRating(recordId, value === next ? 0 : next);
  };
  const base = "h-10 w-10 rounded-md border font-mono text-base leading-none";
  return (
    <div className="mt-4 flex items-center gap-2 font-mono text-xs text-muted">
      <span>評価: {value > 0 ? `+${value}` : value}</span>
      <button
        type="button"
        title="好き"
        aria-pressed={value === 1}
        onClick={() => toggle(1)}
        className={`${base} ${value === 1 ? "border-accent bg-accent text-background" : "border-line hover:text-foreground"}`}
      >
        +
      </button>
      <button
        type="button"
        title="好きじゃない"
        aria-pressed={value === -1}
        onClick={() => toggle(-1)}
        className={`${base} ${value === -1 ? "border-danger bg-danger text-background" : "border-line hover:text-foreground"}`}
      >
        –
      </button>
    </div>
  );
}

export function ReportView() {
  const { id } = useParams<{ id: string }>();
  const staff = useStaff();
  const clearance = staff?.clearance;
  const router = useRouter();
  const [record, setRecord] = useState<ContainmentRecord | null | undefined>(undefined);
  const photoUrl = useObjectUrl(record?.photoFiltered);
  const [exporting, setExporting] = useState(false);
  const documentRef = useRef<HTMLElement>(null);

  // 記録を読み込み、未生成なら照会を始める。照会の進み具合はイベントで受け取る
  useEffect(() => {
    if (!clearance) return;
    let cancelled = false;

    const load = async (startIfNeeded: boolean) => {
      const found = await getRecord(id);
      if (cancelled) return;
      setRecord(found ?? null);
      if (!startIfNeeded || !found || found.status !== "pending" || inFlight.has(found.id)) return;
      if (found.requestedAt && (found.attempts ?? 1) >= 2) {
        // 自動の再照会でも結果を受け取れなかった。これ以上は利用者に任せる
        await updateRecord(found.id, {
          status: "error",
          error: { code: "interrupted", message: "照会が中断されました。再照会してください。" },
        });
        if (!cancelled) setRecord((await getRecord(id)) ?? null);
        return;
      }
      // 初回、またはページの読み込み直しなどで結果を受け取れなかったとき(1回だけ自動で再照会する)
      runQuery(found);
    };

    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) load(false);
    };
    window.addEventListener(RECORD_EVENT, onChange);
    load(true);
    return () => {
      cancelled = true;
      window.removeEventListener(RECORD_EVENT, onChange);
    };
  }, [clearance, id]);

  // O5 で報告書を開いたら、黒塗りが剥がれ始めるのに合わせて音を鳴らす
  const isDone = record?.status === "done";
  useEffect(() => {
    if (!isDone || clearance !== "O5") return;
    const timer = setTimeout(() => play("declassify"), 600);
    return () => clearTimeout(timer);
  }, [isDone, clearance, id]);

  async function onExport() {
    if (!documentRef.current || !record?.itemNumber) return;
    setExporting(true);
    try {
      await exportImage(documentRef.current, `${record.itemNumber}.png`, "#e9e6dc");
    } catch {
      // 共有を取り消したときなど。何もしない
    } finally {
      setExporting(false);
    }
  }

  async function onDiscard() {
    if (!record) return;
    await deleteRecord(record.id);
    router.replace("/scan");
  }

  if (!clearance || record === undefined) {
    return <p className="px-4 py-12 text-sm text-muted">財団データベースに照会中 …</p>;
  }

  return (
    <TerminalShell staff={staff} screen={{ id: "OBS-0210", name: "報告書" }}>
      {record === null && (
        <div className="space-y-4 text-sm leading-7">
          <p className="text-danger">該当する記録は存在しません。</p>
          <p className="text-muted">この記録は削除されたか、別の端末で作成された可能性があります。</p>
          <Link href="/archive" className="text-accent underline">
            収容記録の一覧へ
          </Link>
        </div>
      )}

      {record?.status === "pending" && photoUrl && <QueryLog startedAt={record.requestedAt ?? record.createdAt} photoUrl={photoUrl} />}

      {record?.status === "error" && (
        <div className="space-y-4 text-sm leading-7">
          <p className="text-danger">照会に失敗しました</p>
          <p className="text-muted">{record.error?.message}</p>
          <p className="font-mono text-[10px] text-muted">エラーコード: {record.error?.code ?? "unknown"}</p>
          <div className="flex flex-wrap gap-3">
            {record.error?.code !== "unauthorized" && (
              <button
                type="button"
                onClick={() => runQuery(record)}
                className="btn btn-primary"
              >
                再照会する
              </button>
            )}
            <button type="button" onClick={onDiscard} className="btn btn-secondary">
              記録を破棄する
            </button>
          </div>
        </div>
      )}

      {record?.status === "done" && record.report && record.itemNumber && photoUrl && (
        <div>
          <ReportDocument
            ref={documentRef}
            itemNumber={record.itemNumber}
            report={record.report}
            photoUrl={photoUrl}
            clearance={clearance}
            recordedAt={new Date(record.createdAt)}
          />
          <RatingBox recordId={record.id} />
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              onClick={onExport}
              disabled={exporting}
              className="btn btn-primary"
            >
              {exporting ? "書き出し中 …" : "報告書を画像で保存"}
            </button>
            <Link href="/scan" className="btn btn-secondary">
              次の対象を観測する
            </Link>
          </div>
        </div>
      )}
    </TerminalShell>
  );
}
