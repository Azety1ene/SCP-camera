"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { deleteRecord, listRecords, type ContainmentRecord } from "@/lib/client/db.ts";
import { useStaff } from "@/lib/client/progress.ts";
import { useObjectUrl } from "@/lib/client/useObjectUrl.ts";

const STATUS_LABEL: Record<ContainmentRecord["status"], string> = {
  pending: "照会中",
  done: "収容済み",
  error: "照会失敗",
};

function Thumbnail({ blob, alt }: { blob: Blob; alt: string }) {
  const url = useObjectUrl(blob);
  // eslint-disable-next-line @next/next/no-img-element -- IndexedDB の Blob を表示するため
  return url ? <img src={url} alt={alt} className="aspect-[4/3] w-full object-cover" /> : <div className="aspect-[4/3] w-full bg-panel" />;
}

export function ArchiveList() {
  const staff = useStaff();
  const clearance = staff?.clearance;
  const [records, setRecords] = useState<ContainmentRecord[] | null>(null);

  useEffect(() => {
    if (clearance) listRecords().then(setRecords);
  }, [clearance]);

  async function onDelete(record: ContainmentRecord) {
    const label = record.itemNumber ?? "この記録";
    if (!confirm(`${label} を記録から抹消しますか?この操作は取り消せません。`)) return;
    await deleteRecord(record.id);
    setRecords((prev) => prev?.filter((r) => r.id !== record.id) ?? null);
  }

  if (!clearance) return <p className="px-4 py-12 text-sm text-muted">職員認証を確認中 …</p>;

  return (
    <TerminalShell staff={staff} screen={{ id: "ARC-0300", name: "収容記録" }}>
      <h1 className="font-doc text-xl font-bold">収容記録</h1>
      <p className="mt-1 text-xs text-muted">この端末で作成された報告書の一覧。記録はこの端末の内部にのみ保存されています。</p>

      {records === null && <p className="mt-8 text-sm text-muted">記録を読み込み中 …</p>}

      {records?.length === 0 && (
        <div className="mt-10 space-y-3 text-sm leading-7">
          <p className="text-muted">収容記録はまだありません。</p>
          <Link href="/scan" className="text-accent underline">
            観測を開始する
          </Link>
        </div>
      )}

      {records && records.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {records.map((record) => (
            <li key={record.id} className="border border-line bg-panel">
              <Link href={`/report/${record.id}`} className="block hover:opacity-90">
                <Thumbnail blob={record.photoFiltered} alt={record.itemNumber ?? "記録画像"} />
                <div className="space-y-0.5 p-2 text-[11px] leading-5">
                  <p className="text-foreground">{record.itemNumber ?? "SCP-████-JP"}</p>
                  <p className="truncate text-muted">{record.report?.title ?? STATUS_LABEL[record.status]}</p>
                  <p className="text-muted">
                    {record.report?.objectClass ?? "—"} ／ {new Date(record.createdAt).toLocaleDateString("ja-JP")}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => onDelete(record)}
                className="flex min-h-11 w-full items-center justify-center border-t border-line text-xs text-muted hover:bg-danger/10 hover:text-danger"
              >
                抹消
              </button>
            </li>
          ))}
        </ul>
      )}
    </TerminalShell>
  );
}
