import type { Clearance, ServerClearance } from "@/lib/client/session.ts";

/**
 * 受信箱に届く社内メール。条件を満たした時点で「届いた」ことになる(届いた時刻は端末に保存)。
 * 本文の記法は報告書と同じ(RichText)。既存のSCP記事の人物・団体は登場させない。
 */

export type MailContext = { server: ServerClearance; clearance: Clearance; contained: number };

export type Mail = {
  id: string;
  from: string;
  address: string;
  subject: string;
  body: string;
  /** 届く条件 */
  when: (ctx: MailContext) => boolean;
  /** 一覧で目立たせる(辞令など) */
  important?: boolean;
};

export const MAILS: Mail[] = [
  {
    id: "welcome",
    from: "観測記録部門 人事係",
    address: "jinji.kansoku@site81.scp.int",
    subject: "着任のご案内",
    when: (ctx) => ctx.server !== "O5",
    body: `新任職員各位

このたびは観測記録部門への着任、おめでとうございます。あなたは本日付で統合観測ネットワークの観測所に配属され、観測業務に従事します。

業務の内容は、身の回りにある「ありふれた物」を観測端末で記録することです。異常性の有無を判断する必要はありません。判断は財団データベースが行います。

着任にあたり、次の2点をお願いします。

1. 職員証の登録を済ませてください。
2. 書庫にある『統合観測端末 取扱説明書』を、最後までお読みください。

ご不明な点は、本メールへの返信ではなく、所属部門の窓口までお問い合わせください。本アドレスは送信専用です。

観測記録部門 人事係`,
  },
  {
    id: "first-record",
    from: "観測記録部門 記録課",
    address: "kiroku.kansoku@site81.scp.int",
    subject: "初回観測記録の受理について",
    when: (ctx) => ctx.server !== "O5" && ctx.contained >= 1,
    body: `あなたの初回観測記録を受理しました。

提出された記録は、財団データベースへの照会を経て報告書として登録されています。報告書の一部が黒塗りで表示される場合がありますが、知る必要性の原則に基づく措置です。

観測実績が3件に達した時点で、クリアランスレベル3への昇格審査が自動的に行われます。

なお、記録した物品が報告書の記載と一致しないという問い合わせが、新任職員から多く寄せられています。取扱説明書の「よくある質問」をご確認ください。

観測記録部門 記録課`,
  },
  {
    id: "canteen",
    from: "サイト-81██ 食堂運営委員会",
    address: "shokudo@site81.scp.int",
    subject: "【全職員】木曜日の献立変更について",
    when: (ctx) => ctx.contained >= 2,
    body: `職員各位

来週より、木曜日の献立を全週カレーに統一します。詳しくは書庫の『食堂だより』をご覧ください。

本件に関する問い合わせには、お答えできません。

サイト-81██ 食堂運営委員会`,
  },
  {
    id: "promotion-l3",
    from: "日本支部 人事局",
    address: "jinji@jp.scp.int",
    subject: "辞令(クリアランスレベル3)",
    important: true,
    when: (ctx) => ctx.server !== "O5" && ctx.contained >= 3,
    body: `辞令

観測記録部門 所属職員 殿

本日付で、あなたのセキュリティクリアランスをレベル3に改める。

記

1. 閲覧可能な記録の範囲が拡大される。既に登録された報告書のうち、黒塗りの一部が開示される。
2. 書庫の『観測記録部門 事故事例集』の閲覧を許可する。
3. 昇格に伴う業務内容の変更はない。

以上

日本支部 人事局`,
  },
  {
    id: "promotion-l4",
    from: "日本支部 人事局",
    address: "jinji@jp.scp.int",
    subject: "辞令(クリアランスレベル4)",
    important: true,
    when: (ctx) => ctx.server !== "O5" && ctx.contained >= 6,
    body: `辞令

観測記録部門 所属職員 殿

本日付で、あなたのセキュリティクリアランスをレベル4に改める。

記

1. 閲覧可能な記録の範囲が、さらに拡大される。
2. 書庫の『統合観測ネットワーク 設置経緯書』の閲覧を許可する。同文書はパスコードで保護されている。パスコードは別途通知する。
3. 昇格に伴う業務内容の変更はない。

以上

日本支部 人事局`,
  },
  {
    id: "passcode",
    from: "観測記録部門 部門長室",
    address: "bumoncho.kansoku@site81.scp.int",
    subject: "【要確認】設置経緯書のパスコードについて",
    when: (ctx) => ctx.server !== "O5" && ctx.contained >= 6,
    body: `設置経緯書のパスコードは、規則によりメールでは通知できません。

パスコードは、『事故事例集』の事例3に記載されています。当該の職員が端末に入力していた語句を、ひらがなのまま入力してください。

なお、事例3の職員は通常業務に復帰しています。本件について、当該の職員に直接尋ねることはお控えください。

観測記録部門 部門長室`,
  },
  {
    id: "o5",
    from: "O5-█",
    address: "[編集済み]",
    subject: "(件名なし)",
    important: true,
    when: (ctx) => ctx.server === "O5",
    body: `観測を続けなさい。

端末が何を記録しているかを、[[あなたが知る必要はない]]。あなたが知る必要があるのは、あなたが目を向けた物が、記録された時点で財団の管理下に入るということだけだ。

このメールは閲覧後、あなたの記憶から削除される。`,
  },
  {
    id: "unknown",
    from: "差出人不明",
    address: "—",
    subject: "Re: 観測記録",
    when: (ctx) => ctx.contained >= 8,
    body: `あなたが撮った物は、まだそこにありますか。

[[わたしが撮った物は、もうありません。]]

このメールに心当たりがない場合は、削除せずに保管してください。`,
  },
];
