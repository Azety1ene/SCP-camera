"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { ReportDocument } from "@/components/report/ReportDocument.tsx";
import { deleteRecord, getRecord, updateRecord, type ContainmentRecord } from "@/lib/client/db.ts";
import { useRequireClearance } from "@/lib/client/session.ts";
import { useObjectUrl } from "@/lib/client/useObjectUrl.ts";
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

/** React の開発モードで effect が2回走っても、同じ記録を二重に生成しないため */
const inFlight = new Set<string>();

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
        <p className="text-accent glow">財団データベースに照会中</p>
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

async function exportImage(node: HTMLElement, fileName: string) {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: "#e9e6dc" });
  if (!blob) throw new Error("画像を作成できませんでした");
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: fileName });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportView() {
  const { id } = useParams<{ id: string }>();
  const clearance = useRequireClearance();
  const router = useRouter();
  const [record, setRecord] = useState<ContainmentRecord | null | undefined>(undefined);
  const photoUrl = useObjectUrl(record?.photoFiltered);
  const [exporting, setExporting] = useState(false);
  const documentRef = useRef<HTMLElement>(null);

  const generate = useCallback(async (current: ContainmentRecord) => {
    if (inFlight.has(current.id)) return;
    inFlight.add(current.id);
    const started = await updateRecord(current.id, { status: "pending", requestedAt: Date.now(), error: undefined });
    if (started) setRecord(started);

    let patch: Partial<ContainmentRecord>;
    try {
      const form = new FormData();
      form.append("image", new File([current.photo], "capture.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/generate", { method: "POST", body: form });
      const body = (await res.json()) as GenerateResponse;
      patch =
        "error" in body
          ? { status: "error", error: body.error }
          : { status: "done", itemNumber: body.itemNumber, tone: body.tone, report: body.report };
    } catch {
      patch = { status: "error", error: { code: "network", message: "財団回線との接続が切断されました。" } };
    } finally {
      inFlight.delete(current.id);
    }
    const next = await updateRecord(current.id, patch);
    if (next) setRecord(next);
  }, []);

  // 記録を読み込み、未生成なら生成を始める
  useEffect(() => {
    if (!clearance) return;
    let cancelled = false;
    getRecord(id).then((found) => {
      if (cancelled) return;
      setRecord(found ?? null);
      if (!found || found.status !== "pending") return;
      if (inFlight.has(found.id)) return;
      if (found.requestedAt) {
        // ページを開き直したなどで、前回の照会結果を受け取れなかった。
        // 黙って再生成すると二重に課金されるので、再照会はユーザーに選ばせる
        updateRecord(found.id, {
          status: "error",
          error: { code: "interrupted", message: "照会が中断されました。再照会してください。" },
        }).then((next) => next && !cancelled && setRecord(next));
        return;
      }
      generate(found);
    });
    return () => {
      cancelled = true;
    };
  }, [clearance, id, generate]);

  async function onExport() {
    if (!documentRef.current || !record?.itemNumber) return;
    setExporting(true);
    try {
      await exportImage(documentRef.current, `${record.itemNumber}.png`);
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
    <TerminalShell clearance={clearance}>
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
          <div className="flex flex-wrap gap-3">
            {record.error?.code !== "unauthorized" && (
              <button
                type="button"
                onClick={() => generate(record)}
                className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background"
              >
                再照会する
              </button>
            )}
            <button type="button" onClick={onDiscard} className="border border-line px-4 py-2 text-muted hover:text-foreground">
              記録を破棄する
            </button>
          </div>
        </div>
      )}

      {record?.status === "done" && record.report && record.itemNumber && photoUrl && (
        <div className="glitch-in">
          <ReportDocument
            ref={documentRef}
            itemNumber={record.itemNumber}
            report={record.report}
            photoUrl={photoUrl}
            clearance={clearance}
            recordedAt={new Date(record.createdAt)}
          />
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              onClick={onExport}
              disabled={exporting}
              className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background disabled:opacity-50"
            >
              {exporting ? "書き出し中 …" : "報告書を画像で保存"}
            </button>
            <Link href="/scan" className="border border-line px-4 py-2 text-muted hover:text-foreground">
              次の対象を観測する
            </Link>
          </div>
        </div>
      )}
    </TerminalShell>
  );
}
