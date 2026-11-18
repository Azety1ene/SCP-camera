import Link from "next/link";

export const metadata = { title: "規約・ライセンス | SCP財団 統合観測端末" };

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-12 text-sm leading-7">
      <header>
        <p className="text-xs text-muted">SCP財団 日本支部 統合観測ネットワーク</p>
        <h1 className="mt-1 text-lg text-accent glow">規約・ライセンス</h1>
      </header>

      <section className="space-y-2">
        <h2 className="text-foreground">この端末について</h2>
        <p className="text-muted">
          身の回りの物にカメラを向けて記録すると、その物のSCP報告書(日本支部風)が生成される観測端末です。報告書はAIが写真をもとに作成するフィクションであり、実在の物品・企業・人物とは関係ありません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-foreground">データの扱い</h2>
        <ul className="list-inside list-disc space-y-1 text-muted">
          <li>撮影した画像は、報告書の生成のためにGoogleのGemini APIへ送信されます。</li>
          <li>送信する画像は端末内で縮小し、位置情報などのメタデータは含めません。</li>
          <li>報告書と画像は、お使いのブラウザ内(IndexedDB)にのみ保存され、本サイトのサーバーには保存されません。</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-foreground">ライセンス</h2>
        <p className="text-muted">
          本サイトは、
          <a href="https://scp-wiki.wikidot.com/" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
            SCP Foundation
          </a>
          および
          <a href="http://scp-jp.wikidot.com/" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
            SCP財団 日本支部
          </a>
          の世界観に基づく二次創作です。これらのコンテンツは{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/3.0/deed.ja"
            className="underline hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            クリエイティブ・コモンズ 表示-継承 3.0 (CC BY-SA 3.0)
          </a>{" "}
          で公開されています。本サイトで生成される報告書も、同じライセンスのもとで扱われるものとします。
        </p>
        <p className="text-muted">既存の記事の文章は使用していません。報告書の文体は、公開されている記事の技法を参考にしています。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-foreground">着想</h2>
        <p className="text-muted">映画『Backrooms』公開に合わせて行われた、カメラを使って世界観に入り込む体験型Webサイトに着想を得ています。</p>
      </section>

      <Link href="/" className="text-accent underline">
        認証端末に戻る
      </Link>
    </main>
  );
}
