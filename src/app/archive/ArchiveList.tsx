"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { deleteRecord, listRecords, type ContainmentRecord } from "@/lib/client/db.ts";
import { useStaff } from "@/lib/client/progress.ts";
import { useObjectUrl } from "@/lib/client/useObjectUrl.ts";
import { fetchSharedList, SharedError, type SharedSummary } from "@/lib/client/shared.ts";
import { play } from "@/lib/client/sound.ts";

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

/** 財団データベース(全職員が登録した報告書)の一覧 */
function SharedList() {
  const [items, setItems] = useState<SharedSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchSharedList()
      .then((list) => !cancelled && setItems(list))
      .catch((cause) => !cancelled && setError(cause instanceof SharedError ? cause.message : "財団データベースに接続できません。"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p role="alert" className="mt-8 text-sm text-danger">{error}</p>;
  if (items === null) return <p className="mt-8 text-sm text-muted">財団データベースに照会中 …</p>;
  if (items.length === 0) return <p className="mt-8 text-sm text-muted">登録された記録はまだありません。</p>;

  return (
    <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <li key={item.id} className="border border-line bg-panel">
          <Link href={`/database/${item.id}`} className="block hover:opacity-90">
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob に置いた添付画像 */}
            <img src={item.imageUrl} alt={item.itemNumber} loading="lazy" className="aspect-[4/3] w-full object-cover" />
            <div className="space-y-0.5 p-2 text-[11px] leading-5">
              <p className="text-foreground">{item.itemNumber}</p>
              <p className="truncate text-muted">{item.title}</p>
              <p className="text-muted">
                {item.objectClass} ／ {new Date(item.createdAt).toLocaleDateString("ja-JP")}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type Tab = "local" | "db";

export function ArchiveList() {
  const staff = useStaff();
  const clearance = staff?.clearance;
  const [records, setRecords] = useState<ContainmentRecord[] | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("tab");
  // 指定がなければ、この端末に記録があるときは端末の一覧、ないときは財団データベースを開く
  const tab: Tab | null = requested === "db" || requested === "local" ? requested : records === null ? null : records.length ? "local" : "db";

  useEffect(() => {
    if (clearance) listRecords().then(setRecords);
  }, [clearance]);

  const selectTab = (next: Tab) => {
    play("tap");
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };

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
      <div role="tablist" aria-label="記録の種類" className="mt-4 grid grid-cols-2 border border-line text-sm">
        {(
          [
            ["local", "この端末"],
            ["db", "財団データベース"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => selectTab(key)}
            className={`min-h-11 ${tab === key ? "bg-foreground font-bold text-[#111416]" : "text-muted hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        {tab === "db"
          ? "全職員が登録した報告書の一覧。閲覧できる範囲は、クリアランスに応じて変わります。"
          : "この端末で作成された報告書の一覧。記録はこの端末の内部に保存されています。"}
      </p>

      {tab === "db" && <SharedList />}

      {tab !== "db" && records === null && <p className="mt-8 text-sm text-muted">記録を読み込み中 …</p>}

      {tab === "local" && records?.length === 0 && (
        <div className="mt-10 space-y-3 text-sm leading-7">
          <p className="text-muted">収容記録はまだありません。</p>
          <Link href="/scan" className="text-accent underline">
            観測を開始する
          </Link>
        </div>
      )}

      {tab === "local" && records && records.length > 0 && (
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
