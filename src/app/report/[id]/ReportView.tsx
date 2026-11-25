"use client";

import { exportImage } from "@/lib/client/exportImage.ts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TerminalShell, useTerminalId } from "@/components/TerminalShell.tsx";
import { deleteShared, SharedError, shareReport, tokenStatus, toShareImage } from "@/lib/client/shared.ts";
import { ReportDocument } from "@/components/report/ReportDocument.tsx";
import {
  deleteRecord,
  getPhotos,
  getRecord,
  RECORDS_EVENT,
  updatePhotos,
  updateRecord,
  type ContainmentRecord,
  type RecordPhotos,
} from "@/lib/client/db.ts";
import { useStaff } from "@/lib/client/progress.ts";
import { useObjectUrlState } from "@/lib/client/useObjectUrl.ts";
import { play } from "@/lib/client/sound.ts";
import { forgetAll, forgetPhoto, freshFiltered, freshShare, photoBytes, rememberShare } from "@/lib/client/upload-cache.ts";
import { ExportStatus, exportOutcome, type ExportState } from "@/components/ExportStatus.tsx";
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

/**
 * 財団データベースに登録するときの添付画像。照会のときに指紋をサーバーに渡すので、一度作ったものを使い続ける。
 * 撮影時に作ってあるが、それより前に撮った記録では、ここで作って保存する
 */
async function shareImageFor(id: string, photos: RecordPhotos | undefined): Promise<Blob | undefined> {
  const remembered = freshShare(id) ?? photos?.photoShare;
  if (remembered) return remembered;
  const filtered = freshFiltered(id) ?? photos?.photoFiltered;
  if (!filtered) return undefined;
  try {
    const image = await toShareImage(filtered);
    rememberShare(id, image);
    await updatePhotos(id, { photoShare: image });
    return image;
  } catch (error) {
    console.warn("[query] 登録用の添付画像を作れませんでした", error);
    return undefined;
  }
}

/**
 * 照会(報告書の生成)。結果は IndexedDB に書く(書くと db.ts がイベントで知らせる)。
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

  let patch: Partial<ContainmentRecord>;
  try {
    // 写真のデータを先に読み出しておく(保存先の Blob をそのまま送ると、iPhone で送信に失敗することがある)
    let bytes: ArrayBuffer;
    let share: Blob | undefined;
    try {
      const photos = await getPhotos(current.id);
      bytes = await photoBytes(current.id, photos?.photo);
      share = await shareImageFor(current.id, photos);
    } catch (error) {
      throw new QueryError("read", error);
    }
    const res = await postWithRetry(bytes, share);
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
      patch = { status: "done", itemNumber: body.itemNumber, tone: body.tone, report: body.report, shareToken: body.token };
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
async function postWithRetry(bytes: ArrayBuffer, share: Blob | undefined): Promise<Response> {
  const send = () => {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/jpeg" }), "capture.jpg");
    if (share) form.append("attachment", share, share.type === "image/webp" ? "attachment.webp" : "attachment.jpg");
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
  | { itemNumber: string; tone: string; report: GeneratedReport; token?: string }
  | { error: { code: string; message: string } };

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function QueryLog({ startedAt, photoUrl }: { startedAt: number; photoUrl: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = now - startedAt;
  // 7秒ごとに1行ずつ進める
  const shown = Math.min(QUERY_STEPS.length, 1 + Math.floor(elapsed / 7000));

  return (
    <div className="grid gap-5 sm:grid-cols-[1fr_1.25fr]">
      <div className="border border-line-strong bg-sunken">
        <div className="flex items-center justify-between border-b border-line bg-panel px-2.5 py-1 font-mono text-[10px] text-muted">
          <span>添付資料(照会中)</span>
          <span className="tabular-nums">{formatElapsed(elapsed)}</span>
        </div>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- IndexedDB の Blob を表示するため
          <img src={photoUrl} alt="照会中の記録画像" className="w-full" />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-sunken font-mono text-[11px] text-muted">
            記録画像 ── 表示できません
          </div>
        )}
      </div>
      <div className="border border-line-strong bg-sunken p-4 font-mono text-[12.5px] leading-7">
        <p className="border-b border-line pb-2 font-bold text-foreground">財団データベース照会電文</p>
        <p className="mt-2 mb-3 text-[11px] leading-5 text-muted">
          経過 {formatElapsed(elapsed)} ／ 照会には数分かかることがあります。この画面を開いたままお待ちください。
        </p>
        <div className="space-y-0.5">
          {QUERY_STEPS.slice(0, shown).map((step) => (
            <p key={step} className="text-muted">
              &gt; {step}
            </p>
          ))}
        </div>
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
  const base = "h-9 w-9 border font-mono text-sm font-bold leading-none transition-colors";
  return (
    <div className="mt-5 flex items-center justify-between border border-line bg-panel px-3 py-2 font-mono text-xs text-muted">
      <span>
        記録評価: <strong className="text-foreground">{value > 0 ? `+${value}` : value}</strong>
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="好き"
          aria-pressed={value === 1}
          onClick={() => toggle(1)}
          className={`${base} ${value === 1 ? "border-accent bg-accent text-background" : "border-line-strong bg-sunken text-foreground hover:bg-raised"}`}
        >
          +
        </button>
        <button
          type="button"
          title="好きじゃない"
          aria-pressed={value === -1}
          onClick={() => toggle(-1)}
          className={`${base} ${value === -1 ? "border-danger bg-danger text-background" : "border-line-strong bg-sunken text-foreground hover:bg-raised"}`}
        >
          –
        </button>
      </div>
    </div>
  );
}

const PUBLIC_NOTICE =
  "登録すると、この報告書と添付画像が全職員に公開されます。人物の顔は編集済みの状態で公開されますが、写り込んだ物や場所はそのまま公開されます。";

const FACE_SKIPPED_NOTICE =
  "この記録は、顔認識を利用できない状態で撮影されました。人物の顔が写っている場合、編集されないまま公開されます。登録する前に添付画像を確認してください。";

/**
 * 財団データベース(全職員で共有)への登録と取り下げ。
 * 照会の直後は「登録する / この端末にのみ保存」を選んでもらう。端末にのみ保存しても、後から登録できる(登録票の期限内)
 */
function SharePanel({ record, onChange }: { record: ContainmentRecord; onChange: (patch: Partial<ContainmentRecord>) => void }) {
  const terminalId = useTerminalId();
  const [mode, setMode] = useState<"idle" | "ask" | "withdraw">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (patch: Partial<ContainmentRecord>) => {
    await updateRecord(record.id, patch);
    onChange(patch);
  };

  async function onShare() {
    setBusy(true);
    setError("");
    try {
      // 照会のときに指紋を渡した添付画像をそのまま送る(作り直すと一致しない)
      const image = freshShare(record.id) ?? (await getPhotos(record.id))?.photoShare;
      if (!image) throw new SharedError("no_image", "登録用の添付画像が見つかりません。再照会した記録は登録できます。");
      const { id, deleteKey } = await shareReport(record.shareToken!, image, `81-OP-${terminalId.slice(-4)}`);
      await save({ sharedId: id, sharedDeleteKey: deleteKey, shareDeclined: false });
      setMode("idle");
      play("complete");
    } catch (cause) {
      setError(cause instanceof SharedError ? cause.message : "登録できませんでした。");
      play("deny");
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw() {
    setBusy(true);
    setError("");
    try {
      await deleteShared(record.sharedId!, record.sharedDeleteKey);
      await save({ sharedId: undefined, sharedDeleteKey: undefined, shareDeclined: true });
      setMode("idle");
      play("tap");
    } catch (cause) {
      setError(cause instanceof SharedError ? cause.message : "取り下げられませんでした。");
      play("deny");
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-xs text-danger">
      {error}
    </p>
  );

  if (!record.shareToken && !record.sharedId) {
    return <p className="mt-6 border-t border-line pt-4 text-xs text-muted">この記録には登録票がないため、財団データベースに登録できません。</p>;
  }

  // 登録済み: 開く・取り下げる
  if (record.sharedId) {
    return (
      <div className="mt-6 border-t border-line pt-4 text-sm">
        <p className="text-accent">財団データベースに登録済み</p>
        {mode === "withdraw" ? (
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-6">財団データベースから取り下げます。全職員が閲覧できなくなります。この端末の記録は残り、登録票の期限内なら後からもう一度登録できます。</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={onWithdraw} disabled={busy} className="btn btn-danger">
                {busy ? "取り下げ中 …" : "取り下げる"}
              </button>
              <button type="button" onClick={() => setMode("idle")} disabled={busy} className="btn btn-secondary">
                やめる
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href={`/database/${record.sharedId}`} className="btn btn-secondary">
              登録した記録を開く
            </Link>
            {record.sharedDeleteKey && (
              <button type="button" onClick={() => setMode("withdraw")} className="btn btn-secondary">
                財団データベースから取り下げる
              </button>
            )}
          </div>
        )}
        {errorLine}
      </div>
    );
  }

  // 登録票が古い形式・期限切れのときは、登録できないことを先に伝える
  const status = tokenStatus(record.shareToken!);
  if (status !== "ok") {
    return (
      <p className="mt-6 border-t border-line pt-4 text-xs leading-6 text-muted">
        {status === "expired"
          ? "登録票の有効期限(照会から30日)が切れているため、財団データベースに登録できません。"
          : "この記録の登録票は古い形式のため、財団データベースに登録できません。再照会すると登録できるようになります。"}
      </p>
    );
  }

  // 照会の直後(まだ選んでいない)か、「登録する」を押したとき: 登録するかどうかを選ぶ
  if (!record.shareDeclined || mode === "ask") {
    return (
      <section className="ledger mt-6">
        <div className="ledger-title">
          <h3>財団データベース 登録手続</h3>
          <span className="font-mono text-[10px] font-normal text-muted">全職員共有</span>
        </div>
        <div className="bg-sunken p-4 text-sm">
          <p className="font-bold text-foreground">この報告書を財団データベースに登録しますか?</p>
          <p className="mt-2 text-xs leading-6 text-muted">{PUBLIC_NOTICE}</p>
          {record.faceCheck === "skipped" && <p className="mt-2 text-xs leading-6 text-warn">{FACE_SKIPPED_NOTICE}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={onShare} disabled={busy} className="btn btn-primary">
              {busy ? "登録中 …" : "登録する"}
            </button>
            {record.shareDeclined ? (
              <button type="button" onClick={() => setMode("idle")} disabled={busy} className="btn btn-secondary">
                やめる
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  play("tap");
                  save({ shareDeclined: true });
                }}
                disabled={busy}
                className="btn btn-secondary"
              >
                この端末にのみ保存
              </button>
            )}
          </div>
          {errorLine}
        </div>
      </section>
    );
  }

  // 端末にのみ保存した記録: 後から登録できる
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
      <span className="text-xs text-muted">この記録は、この端末にのみ保存されています。</span>
      <button type="button" onClick={() => setMode("ask")} className="btn btn-secondary">
        財団データベースに登録する
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
  const [photos, setPhotos] = useState<RecordPhotos | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  // 撮影した直後は、保存先を経由しないメモリ上の画像を使う(upload-cache.ts を参照)
  const photoBlob = record ? (freshFiltered(record.id) ?? photos?.photoFiltered) : undefined;
  const photo = useObjectUrlState(photoBlob);
  // 画像を読み出せなかったときも、報告書は表示する(画像の欄は「表示できません」になる)
  const photoFailed = photo.status === "failed" || photos === null;
  const photoUrl = photo.url || (photoFailed ? null : undefined);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const documentRef = useRef<HTMLElement>(null);

  // 記録を読み込み、未生成なら照会を始める。照会の進み具合はイベントで受け取る
  useEffect(() => {
    if (!clearance) return;
    let cancelled = false;

    const load = async (startIfNeeded: boolean) => {
      let found: ContainmentRecord | undefined;
      try {
        found = await getRecord(id);
      } catch (error) {
        console.error("[report] 記録を読み込めませんでした", error);
        if (!cancelled) setLoadError(true);
        return;
      }
      if (cancelled) return;
      setRecord(found ?? null);
      if (!startIfNeeded || !found || found.status !== "pending" || inFlight.has(found.id)) return;
      if (found.requestedAt && (found.attempts ?? 1) >= 2) {
        // 自動の再照会でも結果を受け取れなかった。これ以上は利用者に任せる
        await updateRecord(found.id, {
          status: "error",
          error: { code: "interrupted", message: "照会が中断されました。再照会してください。" },
        });
        return;
      }
      // 初回、またはページの読み込み直しなどで結果を受け取れなかったとき(1回だけ自動で再照会する)
      runQuery(found);
    };

    getPhotos(id)
      .then((found) => !cancelled && setPhotos(found ?? null))
      .catch(() => !cancelled && setPhotos(null));

    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) load(false);
    };
    window.addEventListener(RECORDS_EVENT, onChange);
    load(true);
    return () => {
      cancelled = true;
      window.removeEventListener(RECORDS_EVENT, onChange);
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
    setExportState("busy");
    try {
      setExportState(exportOutcome(await exportImage(documentRef.current, `${record.itemNumber}.png`, "#ece8dc")));
    } catch (error) {
      console.error("[report] 画像を書き出せませんでした", error);
      setExportState("error");
    }
  }

  async function onDiscard() {
    if (!record) return;
    await deleteRecord(record.id);
    forgetAll(record.id);
    router.replace("/scan");
  }

  if (loadError) {
    return (
      <TerminalShell staff={staff} screen={{ id: "OBS-0210", name: "報告書" }}>
        <div className="space-y-4 text-sm leading-7">
          <p className="text-danger">端末の記録を読み込めませんでした。</p>
          <p className="text-muted">ブラウザの保存領域に問題がある可能性があります。ページを読み込み直してください。</p>
          <Link href="/archive" className="text-accent underline">
            収容記録の一覧へ
          </Link>
        </div>
      </TerminalShell>
    );
  }

  if (!clearance || record === undefined) {
    return <p className="px-4 py-12 text-sm text-muted">財団データベースに照会中 …</p>;
  }

  const unauthorized = record?.error?.code === "unauthorized";

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

      {record?.status === "pending" && photoUrl !== undefined && (
        <QueryLog startedAt={record.requestedAt ?? record.createdAt} photoUrl={photoUrl} />
      )}

      {record?.status === "error" && (
        <div className="space-y-4 text-sm leading-7">
          <p className="text-danger">照会に失敗しました</p>
          <p className="text-muted">{record.error?.message}</p>
          {unauthorized && <p className="text-muted">職員認証の有効期限が切れています。認証し直したあと、この記録を収容記録の一覧から開いて再照会できます。</p>}
          <p className="font-mono text-[10px] text-muted">エラーコード: {record.error?.code ?? "unknown"}</p>
          <div className="flex flex-wrap gap-3">
            {unauthorized && (
              <Link href="/" className="btn btn-primary">
                職員認証をやり直す
              </Link>
            )}
            <button type="button" onClick={() => runQuery(record)} className={unauthorized ? "btn btn-secondary" : "btn btn-primary"}>
              再照会する
            </button>
            <button type="button" onClick={onDiscard} className="btn btn-secondary">
              記録を破棄する
            </button>
          </div>
        </div>
      )}

      {record?.status === "done" && record.report && record.itemNumber && photoUrl !== undefined && (
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
          <SharePanel record={record} onChange={(patch) => setRecord({ ...record, ...patch })} />
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={onExport} disabled={exportState === "busy"} className="btn btn-primary">
              {exportState === "busy" ? "書き出し中 …" : "報告書を画像で保存"}
            </button>
            <Link href="/scan" className="btn btn-secondary">
              次の対象を観測する
            </Link>
          </div>
          <ExportStatus state={exportState} subject="報告書" />
        </div>
      )}
    </TerminalShell>
  );
}
