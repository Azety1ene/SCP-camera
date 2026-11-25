import Link from "next/link";

export const metadata = { title: "[データ削除済み] | SCP財団 統合観測端末" };

/** 存在しない URL を開いたとき */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <section className="border-2 border-line-strong bg-panel">
        <div className="flex items-center justify-between border-b border-line-strong bg-sunken px-4 py-2 font-mono text-[11px]">
          <span className="font-bold text-seal-text">ERROR 404</span>
          <span className="text-muted">記録・情報保安管理局</span>
        </div>
        <div className="space-y-4 p-6 text-sm leading-7">
          <p className="font-doc text-lg font-bold text-foreground">[データ削除済み]</p>
          <p className="text-xs leading-6 text-muted">
            要求された文書は存在しないか、あなたのクリアランスでは閲覧できません。
            <br />
            この照会は記録されました。
          </p>
          <div className="pt-2">
            <Link href="/portal" className="btn btn-primary">
              業務トップに戻る
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
