"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { deleteRecord, getPhotos, listRecords, type ContainmentRecord } from "@/lib/client/db.ts";
import { forgetAll } from "@/lib/client/upload-cache.ts";
import { useStaff } from "@/lib/client/progress.ts";
import { useObjectUrl } from "@/lib/client/useObjectUrl.ts";
import { deleteShared, fetchSharedList, SharedError, type SharedSummary } from "@/lib/client/shared.ts";
import { play } from "@/lib/client/sound.ts";

const STATUS_LABEL: Record<ContainmentRecord["status"], string> = {
  pending: "照会中",
  done: "収容済",
  error: "照会失敗",
};

/** 一覧では画像を読み込まないので、サムネイルごとに画像を取り出す */
function Thumbnail({ recordId, alt }: { recordId: string; alt: string }) {
  const [blob, setBlob] = useState<Blob | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    getPhotos(recordId)
      .then((photos) => !cancelled && setBlob(photos?.photoFiltered))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [recordId]);
  const url = useObjectUrl(blob);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- IndexedDB の Blob を表示するため
    <img src={url} alt={alt} className="aspect-[4/3] w-full object-cover" />
  ) : (
    <div className="flex aspect-[4/3] w-full items-center justify-center bg-sunken font-mono text-[9px] text-muted">NO IMG</div>
  );
}

/** 財団データベース(全職員が登録した報告書)の一覧 */
function SharedList() {
  const [items, setItems] = useState<SharedSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const toMessage = (cause: unknown) => (cause instanceof SharedError ? cause.message : "財団データベースに接続できません。");

  useEffect(() => {
    let cancelled = false;
    fetchSharedList()
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNext(page.next);
      })
      .catch((cause) => !cancelled && setError(toMessage(cause)));
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await fetchSharedList(next);
      setItems((prev) => [...(prev ?? []), ...page.items.filter((item) => !prev?.some((p) => p.id === item.id))]);
      setNext(page.next);
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setLoadingMore(false);
    }
  }

  if (error && !items) return <p role="alert" className="mt-6 text-sm text-danger">{error}</p>;
  if (items === null) return <p className="mt-6 font-mono text-xs text-muted">財団データベースに照会中 …</p>;
  if (items.length === 0) return <p className="mt-6 text-sm text-muted">登録された記録はまだありません。</p>;

  return (
    <>
      <div className="ledger mt-5">
        <div className="grid grid-cols-[5.5rem_1fr] gap-3 border-b border-line bg-panel px-3 py-1.5 font-mono text-[10px] text-muted sm:grid-cols-[7.5rem_1fr]">
          <span>証拠画像</span>
          <span>アイテム番号 ／ 題名 ／ 分類・登録元</span>
        </div>
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/database/${item.id}`}
                onClick={() => play("tap")}
                className="grid grid-cols-[5.5rem_1fr] items-start gap-3 px-3 py-3 hover:bg-raised sm:grid-cols-[7.5rem_1fr]"
              >
                <div className="overflow-hidden border border-line-strong bg-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 認証付き API 経由の添付画像 */}
                  <img src={item.imageUrl} alt={item.itemNumber} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
                    <span className="font-bold text-foreground">{item.itemNumber}</span>
                    <span className="border border-line-strong bg-sunken px-1.5 py-0 text-[10px] leading-4 text-muted">
                      {item.objectClass}
                    </span>
                  </div>
                  <p className="line-clamp-2 font-doc text-sm font-bold leading-snug text-foreground">{item.title}</p>
                  <p className="font-mono text-[11px] text-muted">
                    {new Date(item.createdAt).toLocaleDateString("ja-JP")}
                    {item.observatory && ` ／ ${item.observatory}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      {next && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className="btn btn-secondary mt-5 w-full text-sm">
          {loadingMore ? "照会中 …" : "さらに古い記録を表示"}
        </button>
      )}
    </>
  );
}

/**
 * 端末の記録1行(台帳形式)。「抹消」を押したときだけ行の下部に確認帯を開く
 */
function LocalRecordRow({ record, onDeleted }: { record: ContainmentRecord; onDeleted: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shared = !!record.sharedId;
  const canWithdraw = shared && !!record.sharedDeleteKey;

  async function run(alsoShared: boolean) {
    setBusy(true);
    setError("");
    try {
      if (alsoShared) await deleteShared(record.sharedId!, record.sharedDeleteKey);
      await deleteRecord(record.id);
      forgetAll(record.id);
      play("deny");
      onDeleted();
    } catch (cause) {
      setError(cause instanceof SharedError ? cause.message : "抹消できませんでした。");
      setBusy(false);
    }
  }

  return (
    <li className="bg-background">
      <div className="grid grid-cols-[5.5rem_1fr_auto] items-start gap-3 px-3 py-3 sm:grid-cols-[7.5rem_1fr_auto]">
        <Link href={`/report/${record.id}`} onClick={() => play("tap")} className="overflow-hidden border border-line-strong bg-sunken hover:opacity-90">
          <Thumbnail recordId={record.id} alt={record.itemNumber ?? "記録画像"} />
        </Link>

        <Link href={`/report/${record.id}`} onClick={() => play("tap")} className="min-w-0 space-y-1 hover:opacity-90">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
            <span className={record.itemNumber ? "font-bold text-foreground" : "text-muted"}>
              {record.itemNumber ?? "番号未割当"}
            </span>
            {record.report?.objectClass && (
              <span className="border border-line-strong bg-sunken px-1.5 py-0 text-[10px] leading-4 text-muted">
                {record.report.objectClass}
              </span>
            )}
            {record.sharedId && (
              <span className="border border-accent/60 bg-accent/10 px-1.5 py-0 text-[10px] leading-4 text-accent">
                DB登録済
              </span>
            )}
          </div>
          <p
            className={`line-clamp-2 font-doc text-sm font-bold leading-snug ${
              record.status === "error" ? "text-danger" : record.status === "pending" ? "text-warn" : "text-foreground"
            }`}
          >
            {record.report?.title ?? STATUS_LABEL[record.status]}
          </p>
          <p className="font-mono text-[11px] text-muted">
            {new Date(record.createdAt).toLocaleDateString("ja-JP")} ／ {STATUS_LABEL[record.status]}
          </p>
        </Link>

        <button
          type="button"
          onClick={() => {
            play("tap");
            setConfirmOpen((v) => !v);
          }}
          aria-expanded={confirmOpen}
          className="flex min-h-10 items-center border border-line px-2.5 font-mono text-[11px] text-muted hover:border-danger/60 hover:text-danger"
        >
          {confirmOpen ? "閉じる" : "抹消"}
        </button>
      </div>

      {confirmOpen && (
        <div className="border-t border-line bg-sunken px-3 py-3 text-xs">
          <p className="leading-5 text-foreground">
            {shared ? "抹消する範囲を選んでください。" : "この記録を端末から抹消します。取り消せません。"}
          </p>
          {shared && !canWithdraw && (
            <p className="mt-1 leading-5 text-muted">財団データベースの記録は、この端末からは取り下げられません。</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {canWithdraw && (
              <button type="button" disabled={busy} onClick={() => run(true)} className="btn btn-danger min-h-9 px-3 text-xs">
                端末と財団データベースから抹消
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => run(false)} className="btn btn-danger min-h-9 px-3 text-xs">
              {shared ? "端末からのみ抹消" : "抹消を実行"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirmOpen(false)} className="btn btn-secondary min-h-9 px-3 text-xs">
              やめる
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 leading-5 text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

type Tab = "local" | "db";

export function ArchiveList() {
  const staff = useStaff();
  const clearance = staff?.clearance;
  const [records, setRecords] = useState<ContainmentRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  /** 開いたときに決めた既定のタブ。抹消して件数が0になっても、勝手に切り替えない */
  const [initialTab, setInitialTab] = useState<Tab | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("tab");
  const tab: Tab | null = requested === "db" || requested === "local" ? requested : initialTab;

  useEffect(() => {
    if (!clearance) return;
    let cancelled = false;
    listRecords()
      .then((list) => {
        if (cancelled) return;
        setRecords(list);
        setInitialTab((current) => current ?? (list.length ? "local" : "db"));
      })
      .catch((error) => {
        console.error("[archive] 端末の記録を読み込めませんでした", error);
        if (cancelled) return;
        setLoadError(true);
        setRecords([]);
        setInitialTab((current) => current ?? "local");
      });
    return () => {
      cancelled = true;
    };
  }, [clearance]);

  const selectTab = (next: Tab) => {
    play("tap");
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };

  const removeFromList = (id: string) => setRecords((prev) => prev?.filter((r) => r.id !== id) ?? null);

  if (!clearance) return <p className="px-4 py-12 font-mono text-xs text-muted">職員認証を確認中 …</p>;

  return (
    <TerminalShell staff={staff} screen={{ id: "ARC-0300", name: "収容記録" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h1 className="font-doc text-lg font-bold tracking-wide">収容記録台帳</h1>
        {tab === "local" && records && (
          <span className="font-mono text-[11px] text-muted">端末内 {records.length} 件</span>
        )}
      </div>

      {/* 業務画面のフォルダタブ */}
      <div role="tablist" aria-label="記録の種類" className="mt-4 flex border-b border-line-strong text-xs font-bold">
        {(
          [
            ["local", "この端末の記録"],
            ["db", "財団データベース(共有)"],
          ] as const
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(key)}
              className={`min-h-10 flex-1 border-t border-x px-3 transition-colors sm:flex-none sm:px-5 ${
                active
                  ? "-mb-px border-line-strong border-b-background bg-background text-foreground shadow-[inset_0_2px_0_var(--foreground)]"
                  : "border-line bg-sunken text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        {tab === "db"
          ? "全職員が登録した報告書の共有目録です。閲覧できる範囲はクリアランスに応じて変わります。"
          : "この端末で作成された報告書の記録台帳です。データは端末の内部に保存されています。"}
      </p>

      {tab === "db" && <SharedList />}

      {tab !== "db" && records === null && <p className="mt-6 font-mono text-xs text-muted">記録を読み込み中 …</p>}

      {tab === "local" && loadError && (
        <p role="alert" className="mt-6 text-sm text-danger">
          端末の記録を読み込めませんでした。ページを読み込み直してください。
        </p>
      )}

      {tab === "local" && !loadError && records?.length === 0 && (
        <div className="mt-6 border border-line bg-panel p-5 text-sm leading-7">
          <p className="text-muted">この端末に収容記録はまだありません。</p>
          <Link href="/scan" onClick={() => play("tap")} className="btn btn-primary mt-4">
            観測を開始する
          </Link>
        </div>
      )}

      {tab === "local" && records && records.length > 0 && (
        <div className="ledger mt-5">
          <div className="grid grid-cols-[5.5rem_1fr_auto] gap-3 border-b border-line bg-panel px-3 py-1.5 font-mono text-[10px] text-muted sm:grid-cols-[7.5rem_1fr_auto]">
            <span>証拠画像</span>
            <span>アイテム番号 ／ 題名 ／ 状態</span>
            <span className="pr-2">操作</span>
          </div>
          <ul className="divide-y divide-line">
            {records.map((record) => (
              <LocalRecordRow key={record.id} record={record} onDeleted={() => removeFromList(record.id)} />
            ))}
          </ul>
        </div>
      )}
    </TerminalShell>
  );
}
