# SCP-camera

身の回りの物にカメラを向けて撮影すると、その物の「SCP報告書(日本支部風)」が生成されるWebアプリ。
財団から支給された観測端末、という設定でSCPの世界に入り込む体験を作る。

- 仕様:[`docs/SPEC.md`](docs/SPEC.md)
- 報告書の文体・物語技法の分析:[`docs/research/00-summary.md`](docs/research/00-summary.md)

## 開発

パッケージ管理は pnpm。

```bash
pnpm install
cp .env.example .env.local   # 値を設定する
pnpm dev
```

### スマホの実機で確認する

スマホのカメラはHTTPSでないと使えないので、専用のコマンドで起動する。

```bash
pnpm dev:phone
```

- PCのLAN内IPアドレス用の自己署名証明書を `.certificates/` に作り、HTTPSで開発サーバーを立てる
- 表示された `https://<IP>:3000` を、同じWi-Fiにつないだスマホで開く
- 自己署名証明書なので警告が出る。iPhone(Safari)は「詳細を表示」→「このWebサイトを閲覧」、Android(Chrome)は「詳細設定」→「アクセスする」で進む
- 開発サーバーなので、生成には開発用のモデルが使われる

## 技術構成

Next.js(App Router)/ Tailwind CSS / Gemini API / Vercel。DBは使わない(報告書はブラウザの IndexedDB に保存)。

## ライセンス

SCP財団のコンテンツは [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) で公開されている。本作はその世界観をもとにした二次創作。
