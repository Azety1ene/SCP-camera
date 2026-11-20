# AIスロップの研究と、このサイトへの適用

「AIが作ったと一目で分かる、ありきたりなUI」について書かれた技術ブログ・デザイン資料を読み、このサイトに当てはめた記録。

## 読んだもの
- [Anti AI slop ban list](https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list)(GitHub, ux-skill)
- [How to detect AI slop in your design](https://github.com/Laith0003/ux-skill/wiki/How-to-detect-AI-slop-in-your-design)(同上)
- [anti-ai-slop.md](https://raw.githubusercontent.com/referodesign/refero_skill/f78b4eccf112d7a179b92afeafdd7e8684560ac2/references/anti-ai-slop.md)(Refero)
- [Spot the slop: a UI designer's guide to fixing AI defaults](https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c)(Kosta Canatselis)
- [AI Makes Bad Design Look Good Enough](https://builtin.com/articles/ai-design-slop-era)(Built In)
- [How to fix the AI-generated look in your frontend](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh)(DEV Community)
- [AI臭を消すデザインスキルの紹介](https://www.techno-edge.net/article/2026/11/03/5660.html)(テクノエッジ)
- 読めなかった:impeccable の anti-patterns(410)、uxdesign.cc の記事(403)

## 分かったこと
- **AIっぽさの正体は「決定の欠如」。** モデルは学習データの平均を出すので、誰も選んでいない既定値(Tailwind の色、Inter、`rounded-2xl` と影のカード、中央寄せのヒーロー、3枚のカード)に収束する
- **直し方は「実在の何かを参照する」こと。** スキューモーフィズムは実物を指していたが、AI生成はどこも指していない(Built In)。時代・媒体・物を先に決め、色・書体・角丸・余白をそこから決める
- 最初に効くのは書体。次に色を「意味」で割り当て、装飾の色をやめる
- 階層は意図的な不均一さで作る(重要なものを大きく、それ以外を引かせる)
- 空状態・エラー・読み込み中に個性が出る
- 判断の基準(Kosta):「どこかから来た感じがするか」「声はあるか」「なくなったら気づくか」

### 特に名指しされていた特徴
- 紫〜青・インディゴのグラデーション、定番のグリーン(`#10B981`)
- **カードの片側だけの太い色線**(「AI製UIの最も分かりやすい特徴」)
- 見出しの上の小さなラベル、見出しの1語だけ色を変える装飾
- カードの乱用(影・枠線・背景の重ね掛け)、一律の角丸と余白
- ブランド色の使いすぎ(ボタン・リンク・枠・バッジ・フォーカスまで同じ色)
- すべての要素が同じフェードイン、常に光る演出
- 架空の名前・丸い数字・中身のない定型句

## このサイトでの点検結果
| 特徴 | 当てはまっていた所 |
|---|---|
| 片側だけの色線 | ACSの帯の各欄、夜間当直の注意書き |
| 見出しの上の小さなラベル | ポータルの「確保・収容・保護」 |
| カードの乱用・一律の見た目 | ポータルの4つのパネル、書庫の一覧、すべて同じ角丸と余白 |
| アクセント色の使いすぎ | 緑がボタン・タブ・リンク・バッジ・紋章・見出しのすべてに |
| 同じフェードイン | ほぼすべての要素に `glitch-in` |
| 汎用のモバイルUI | アイコン付きの下部タブ、丸いピル型のスイッチ |

## 決めた参照先と、そこからの決定
**参照先:日本の官公庁・大企業の業務端末(1990〜2000年代)と、公文書。** 財団日本支部の内部システムが実在したら、こう見えるはず、という発想。

| 項目 | 決定 | 理由 |
|---|---|---|
| 書体 | UIは BIZ UDPゴシック、文書は BIZ UDP明朝、端末表示は等幅 | 自治体の公文書で採用が広がるUDフォント。公文書は明朝 |
| 色 | 地は暗いまま。文字は紙のような白。**朱(印鑑の朱肉)**を機密・警告・印に。緑は「正常・閲覧可」の意味だけ | 色を意味で割り当てる |
| 主要ボタン | 紙の白の塗りつぶし(緑の塗りをやめる) | ブランド色の使いすぎを避ける |
| 角 | 角丸をやめ、角を立てる | 帳票・業務端末 |
| 画面下 | ファンクションキーの帯(F1〜F5)。選択中は白黒反転 | 業務端末の画面 |
| 画面上 | 画面ID(PTL-0100 など)を表示。効果音は入/切のスイッチ | 業務システムの画面 |
| 枠 | 箱で囲まず、罫線で区切る帳票の形。書庫は文書管理台帳(表) | 帳票・台帳 |
| 文書 | 決裁欄(起案・審査・承認と朱の印)を付ける | 公文書 |
| 動き | フェードインは起動ログなど端末の表示だけ | 状態の変化だけを動かす |
