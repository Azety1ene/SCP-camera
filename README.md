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

スマホの実機でカメラを試すときはHTTPSが必要なので、`pnpm dev --experimental-https` を使う。

## 技術構成

Next.js(App Router)/ Tailwind CSS / Gemini API / Vercel。DBは使わない(報告書はブラウザの IndexedDB に保存)。

## ライセンス

SCP財団のコンテンツは [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) で公開されている。本作はその世界観をもとにした二次創作。
