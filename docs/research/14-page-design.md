# 界隈の研究 4: ページデザインの文化

出典:SCP Foundation Wiki(http://scp-wiki.wikidot.com/)、SCP財団 日本語Wiki(http://scp-jp.wikidot.com/)、CC BY-SA 3.0。

- 読めた:本家 components-hub(後半は要約経由)、component:passcode / classification-effect / object-class-bar / inline-colmod、JP の anomaly-classification-system-guide / component:anomaly-class-bar
- 読めなかった(404):本家 theme-hub、JP の theme-hub-jp / component-hub-jp
- テーマについて分かったのは名前だけ(本家の既定テーマ Sigma-10、他に Sigma-9 / Black Highlighter / BASALT)。多くの部品はテーマに依存する

## 「端末」「文書」「機密」を表す部品
**機密・分類**
- **ACS(Anomaly Class Bar):** 番号・クリアランス・収容・副次・撹乱・リスクの各クラスを、アイコン付きで並べるヘッダー。派生に Slim ACS、ACS Animation(読み込み時にアニメーション)など
- **Object Class Bar:** 番号・収容クラス・責任サイト・ディレクター・研究主任・担当機動部隊・レベルと、6本の色帯で機密度を示す
- **Classified Decoration:** レベルに応じた「CLASSIFIED」表示
- **AIM:** 配属サイト・サイト管理官・研究責任者・担当機動部隊を縦に並べた人事ファイル風ヘッダー

**アクセス制限・黒塗り**
- **Classification Effect:** 黒塗りをクリックで解除。解除と再秘匿の速度を別々に指定できる
- **Passcode:** パスコードで中身が開く。ページ自身に「表示目的のみで、実際の保護ではない」と明記されている
- **Inline Collapsible:** 本文の一部だけを「権限がある人のみ閲覧可」風に隠す
- **ID Cards:** レベル・写真・氏名・部署・役職・ID番号・有効期限を持つアクセスカード

**文書・通信**
- **Dynamic Emails:** From / To / CC / Subject 付きの社内メール風。`scp.int` のアドレス
- **Document Transcript Swapper:** 原本画像と書き起こしを切り替える
- **Image Block:** 「PoI-0007-A 監視写真」のような証拠風キャプション
- **Nested Collapsibles:** 入れ子の折りたたみ
- (要約経由)端末そのものを再現する専用部品は見当たらず、近いものに SMS 風、架空SNS、掲示板風の部品がある

## 記事でよく使われる仕掛けと効果
| 仕掛け | 効果 |
|---|---|
| クラス付きヘッダー(ACS など) | 一目で危険度と扱いが分かる。記事の顔になる |
| 色帯・スタンプ | 機密文書らしい重み |
| 黒塗りのクリック解除 | 読者が自分で「開示する」体験になる |
| 権限制限の隠し部分 | 「閲覧資格がない」という物語上の制限を見せる |
| 原本と書き起こしの切り替え | 資料らしさ |
| 社内メール・IDカード | 文書の出所や持ち主が分かる |
| 監視写真のキャプション | 写真が「証拠」になる |
| 文字のグリッチ | 異常時の一文に限ると効果的 |

## サイトへの転用(優先度順)
1. **ACSの帯**を報告書の冒頭に置く(アイコンは自作する。WikiのSVGを直接読み込まない)
2. 黒塗りのタップ演出(実装済み)を、Wikiの Classification Effect の文脈に合わせて磨く
3. **CLASSIFIED スタンプ**と色帯
4. **社内メール**の形式で、財団からの通知を届ける
5. **IDカード**で職員証を表示する
6. 原本⇄書き起こしの切り替え(手書きメモなどの資料に)
7. グリッチは異常時の一文に限る
