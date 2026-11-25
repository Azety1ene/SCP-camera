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

- `pnpm dev` / `pnpm build` は、先に顔検出の WASM を `node_modules` から `public/mediapipe/wasm/` に写す(`scripts/copy-mediapipe.mjs`。Git には含めない)
- `pnpm test` で単体テスト(Vitest)、`pnpm lint` で ESLint

### スマホの実機で確認する

スマホのカメラはHTTPSでないと使えないので、専用のコマンドで起動する。

```bash
pnpm dev:phone
```

- PCのLAN内IPアドレス用の自己署名証明書を `.certificates/` に作り、HTTPSで開発サーバーを立てる
- 表示された `https://<IP>:3000` を、同じWi-Fiにつないだスマホで開く
- 自己署名証明書なので警告が出る。iPhone(Safari)は「詳細を表示」→「このWebサイトを閲覧」、Android(Chrome)は「詳細設定」→「アクセスする」で進む
- 開発サーバーなので、生成には開発用のモデルが使われる

## 報告書の出どころ

初期設定では、どの写真を撮っても、`src/lib/report/samples/` に用意した見本の報告書のどれかが表示される(Gemini は呼ばない)。
環境変数 `REPORT_SOURCE=gemini` を設定したときだけ、Gemini で写真から報告書を生成する。

## 技術構成

Next.js(App Router)/ Tailwind CSS / Gemini API / Vercel。

- 報告書と写真は、ブラウザの IndexedDB に保存する
- 利用者が登録した報告書だけ、全職員で共有する「財団データベース」に送る。本文は Neon(Postgres)、添付画像は Vercel Blob の private のストア(`SCP_CAMERA_IMAGE_READ_WRITE_TOKEN`)に置き、認証済みの Cookie を確かめる `/api/shared/[id]/image` から配信する
- 認証・照会・登録のレート制限も Neon の表で数える(`DATABASE_URL` が未設定なら制限しない)

## ライセンス

SCP財団のコンテンツは [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) で公開されている。本作はその世界観をもとにした二次創作。
