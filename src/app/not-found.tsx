import Link from "next/link";

export const metadata = { title: "[データ削除済み] | SCP財団 統合観測端末" };

/** 存在しない URL を開いたとき */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center text-sm leading-7">
      <p className="text-xs tracking-[0.4em] text-muted">ERROR 404</p>
      <p className="text-lg text-danger">[データ削除済み]</p>
      <p className="text-muted">
        要求された文書は存在しないか、あなたのクリアランスでは閲覧できません。
        <br />
        この照会は記録されました。
      </p>
      <Link href="/portal" className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background">
        ポータルに戻る
      </Link>
    </main>
  );
}
