"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { ReportDocument } from "@/components/report/ReportDocument.tsx";
import { listRecords, updateRecord, type ContainmentRecord } from "@/lib/client/db.ts";
import { useStaff } from "@/lib/client/progress.ts";
import { deleteShared, fetchShared, SharedError, type SharedReport } from "@/lib/client/shared.ts";
import { exportImage } from "@/lib/client/exportImage.ts";
import { play } from "@/lib/client/sound.ts";
import { ExportStatus, exportOutcome, type ExportState } from "@/components/ExportStatus.tsx";

/** 財団データベースに登録された報告書。黒塗りは、読む人のクリアランスに合わせて外す */
export function SharedReportView() {
  const { id } = useParams<{ id: string }>();
  const staff = useStaff();
  const clearance = staff?.clearance;
  const router = useRouter();
  const [item, setItem] = useState<SharedReport | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "confirm-delete" | "delete">("");
  const [exportState, setExportState] = useState<ExportState>("idle");
  /** この端末から登録した記録(あれば、取り下げられる) */
  const [own, setOwn] = useState<ContainmentRecord | null>(null);
  const documentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!clearance) return;
    let cancelled = false;
    fetchShared(id)
      .then((found) => !cancelled && setItem(found))
      .catch((cause) => {
        if (cancelled) return;
        if (cause instanceof SharedError && cause.code === "not_found") setItem(null);
        else setError(cause instanceof SharedError ? cause.message : "財団データベースに接続できません。");
      });
    listRecords()
      .then((records) => {
        if (!cancelled) setOwn(records.find((r) => r.sharedId === id && r.sharedDeleteKey) ?? null);
      })
      // 端末の記録を読めなくても、報告書は表示する(取り下げのボタンが出ないだけ)
      .catch((cause) => console.warn("[database] 端末の記録を読み込めませんでした", cause));
    return () => {
      cancelled = true;
    };
  }, [clearance, id]);

  // O5 で開いたら、黒塗りが剥がれ始めるのに合わせて音を鳴らす
  const loaded = !!item;
  useEffect(() => {
    if (!loaded || clearance !== "O5") return;
    const timer = setTimeout(() => play("declassify"), 600);
    return () => clearTimeout(timer);
  }, [loaded, clearance]);

  async function onExport() {
    if (!documentRef.current || !item) return;
    setExportState("busy");
    try {
      setExportState(exportOutcome(await exportImage(documentRef.current, `${item.itemNumber}.png`, "#ece8dc")));
    } catch (cause) {
      console.error("[database] 画像を書き出せませんでした", cause);
      setExportState("error");
    }
  }

  async function onDelete() {
    setBusy("delete");
    try {
      // 自分の端末から登録したものは鍵で取り下げる。O5 は鍵なしで抹消できる
      await deleteShared(id, own?.sharedDeleteKey);
      if (own) await updateRecord(own.id, { sharedId: undefined, sharedDeleteKey: undefined, shareDeclined: true });
      play("deny");
      router.replace("/archive?tab=db");
    } catch (cause) {
      setError(cause instanceof SharedError ? cause.message : "削除できませんでした。");
      setBusy("");
    }
  }

  if (!clearance || (item === undefined && !error)) {
    return <p className="px-4 py-12 text-sm text-muted">財団データベースに照会中 …</p>;
  }

  return (
    <TerminalShell staff={staff} screen={{ id: "DB-0310", name: "財団データベース" }}>
      <Link href="/archive?tab=db" className="btn btn-secondary mb-5 text-sm">
        ← 財団データベースの一覧
      </Link>

      {error && !item && <p role="alert" className="text-sm text-danger">{error}</p>}

      {item === null && (
        <div className="space-y-2 text-sm leading-7">
          <p className="text-danger">該当する記録は存在しません。</p>
          <p className="text-muted">この記録は抹消された可能性があります。</p>
        </div>
      )}

      {item && (
        <div>
          <p className="mb-3 font-mono text-[11px] text-muted">
            登録元 {item.observatory ?? "不明な観測所"} ／ {new Date(item.createdAt).toLocaleDateString("ja-JP")}
          </p>
          <ReportDocument
            ref={documentRef}
            itemNumber={item.itemNumber}
            report={item.report}
            photoUrl={item.imageUrl}
            clearance={clearance}
            recordedAt={new Date(item.createdAt)}
          />
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={onExport} disabled={exportState === "busy" || busy === "delete"} className="btn btn-primary">
              {exportState === "busy" ? "書き出し中 …" : "報告書を画像で保存"}
            </button>
          </div>
          <ExportStatus state={exportState} subject="報告書" />

          {/* O5 は何でも抹消できる。登録した端末は取り下げられる */}
          {(clearance === "O5" || own) && (
            <div className="mt-8 border-t border-line pt-4 text-sm">
              {busy === "confirm-delete" || busy === "delete" ? (
                <div className="space-y-3">
                  <p className="text-xs leading-6">
                    この記録を財団データベースから{own ? "取り下げます" : "抹消します"}。全職員の端末から閲覧できなくなります。
                    {own && "この端末の記録は残ります。"}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={onDelete} disabled={busy === "delete"} className="btn btn-danger">
                      {busy === "delete" ? "処理中 …" : own ? "取り下げる" : "抹消する"}
                    </button>
                    <button type="button" onClick={() => setBusy("")} disabled={busy === "delete"} className="btn btn-secondary">
                      やめる
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setBusy("confirm-delete")} className="btn btn-secondary text-danger">
                  {own ? "財団データベースから取り下げる" : "O5権限で抹消する"}
                </button>
              )}
              {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
            </div>
          )}
        </div>
      )}
    </TerminalShell>
  );
}
