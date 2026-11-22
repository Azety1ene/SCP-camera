"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { ReportDocument } from "@/components/report/ReportDocument.tsx";
import { useStaff } from "@/lib/client/progress.ts";
import { deleteShared, fetchShared, SharedError, type SharedReport } from "@/lib/client/shared.ts";
import { exportImage } from "@/lib/client/exportImage.ts";
import { play } from "@/lib/client/sound.ts";

/** 財団データベースに登録された報告書。黒塗りは、読む人のクリアランスに合わせて外す */
export function SharedReportView() {
  const { id } = useParams<{ id: string }>();
  const staff = useStaff();
  const clearance = staff?.clearance;
  const router = useRouter();
  const [item, setItem] = useState<SharedReport | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "export" | "confirm-delete" | "delete">("");
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
    setBusy("export");
    try {
      await exportImage(documentRef.current, `${item.itemNumber}.png`, "#e9e6dc");
    } catch {
      // 共有を取り消したときなど
    } finally {
      setBusy("");
    }
  }

  async function onDelete() {
    setBusy("delete");
    try {
      await deleteShared(id);
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
            <button type="button" onClick={onExport} disabled={busy !== ""} className="btn btn-primary">
              {busy === "export" ? "書き出し中 …" : "報告書を画像で保存"}
            </button>
          </div>

          {/* O5 だけが抹消できる */}
          {clearance === "O5" && (
            <div className="mt-8 border-t border-line pt-4 text-sm">
              {busy === "confirm-delete" || busy === "delete" ? (
                <div className="space-y-3">
                  <p className="text-xs leading-6">この記録を財団データベースから抹消します。全職員の端末から閲覧できなくなります。</p>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={onDelete} disabled={busy === "delete"} className="btn btn-danger">
                      {busy === "delete" ? "抹消中 …" : "抹消する"}
                    </button>
                    <button type="button" onClick={() => setBusy("")} disabled={busy === "delete"} className="btn btn-secondary">
                      やめる
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setBusy("confirm-delete")} className="btn btn-secondary text-danger">
                  O5権限で抹消する
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
