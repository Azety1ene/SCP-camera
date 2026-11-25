import { AboutFrame } from "./AboutFrame";

export const metadata = { title: "規約・ライセンス | SCP財団 統合観測端末" };

export default function AboutPage() {
  return (
    <AboutFrame>

      <section className="space-y-2">
        <h2 className="font-bold text-foreground">この端末について</h2>
        <p className="text-muted">
          身の回りの物にカメラを向けて記録すると、その物のSCP報告書(日本支部風)が生成される観測端末です。報告書はAIが写真をもとに作成するフィクションであり、実在の物品・企業・人物とは関係ありません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-foreground">データの扱い</h2>
        <ul className="list-inside list-disc space-y-1 text-muted">
          <li>
            撮影した画像は、報告書の生成のために本サイトのサーバーを経由して Google の Gemini API へ送信されます。Gemini API
            の無料枠では、送信した画像や生成した文章が Google の製品やサービスの改善に使われることがあります。人物や個人情報が写った画像は撮影しないでください。
          </li>
          <li>送信する画像は端末内で縮小し、位置情報などのメタデータは含めません。本サイトのサーバーは、生成のために受け取った画像を保存しません。</li>
          <li>
            写っている人の顔は、送信や保存の前に端末内で自動的に黒塗りにします。顔の検出はブラウザ内で行い、そのための画像はどこにも送りません(検出の仕組みは
            MediaPipe を使い、実行用のファイルは本サイトから配信します)。顔を検出できない場合や、顔認識を利用できない環境では黒塗りにならないことがあります。顔認識を利用できないときは、観測画面に表示します。
          </li>
          <li>報告書と画像は、通常はお使いのブラウザ内(IndexedDB)にのみ保存されます。</li>
          <li>
            「財団データベースに登録する」を選んだ報告書だけは、本文と添付画像(監視カメラ風に加工し、顔を黒塗りにしたもの)が本サイトのサーバー(データベースは
            Neon、画像は Vercel Blob)に保存され、合言葉で認証した全職員が閲覧できるようになります。元の写真と職員証の氏名は送りません。登録元として、端末ごとの観測所番号(81-OP-XXXX)が表示されます。
          </li>
          <li>
            登録した報告書は、登録した端末から取り下げられます(端末の記録を消すと、取り下げはできなくなります)。取り下げると、サーバーから本文と画像を削除します。すでに閲覧した端末には、画像が最大10分ほど残ることがあります。
          </li>
          <li>不正な利用を防ぐため、認証・照会・登録の回数を、接続元の IP アドレスごとに数えています。IP アドレスはそのまま保存せず、元に戻せない形に変換して数え、2日を過ぎた記録は順次削除します。</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-foreground">ライセンス</h2>
        <p className="text-muted">
          本サイトは、
          <a href="https://scp-wiki.wikidot.com/" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
            SCP Foundation
          </a>
          および
          <a href="https://scp-jp.wikidot.com/" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
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
        <h2 className="font-bold text-foreground">着想</h2>
        <p className="text-muted">映画『Backrooms』公開に合わせて行われた、カメラを使って世界観に入り込む体験型Webサイトに着想を得ています。</p>
      </section>
    </AboutFrame>
  );
}
