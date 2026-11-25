import type { StoredReport } from "./schema.ts";

/**
 * 報告書の黒塗り([[...]])と、それを読むのに必要なクリアランス。
 *
 * 記法: [[L3:語句]] [[L4:語句]] [[O5:語句]]。生成する AI が、物語の中での重さに応じて付ける
 * (軽い伏線は L3、核心に近いものは L4、真相そのものは O5)。
 * レベルの付いていない [[語句]] は、仕組みを入れる前の記録。報告書の中での出現順に、前から L3 → L4 → O5 へ均等に割り振る。
 */

export type RedactionLevel = "L3" | "L4" | "O5";

const LEVELS: readonly RedactionLevel[] = ["L3", "L4", "O5"];

/** [[...]] 1つ。1番目の組はレベル(省略可)、2番目の組は中身 */
export const REDACTION = /\[\[(?:(L3|L4|O5)\s*[:：]\s*)?([\s\S]+?)\]\]/g;

export function parseRedaction(level: string | undefined): RedactionLevel | null {
  return level && (LEVELS as readonly string[]).includes(level) ? (level as RedactionLevel) : null;
}

/** 文字列から決まる 0〜1 の値。黒塗りの開示の順番などを、毎回同じにするために使う */
export function stableFraction(text: string): number {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash % 1000) / 1000;
}

/** レベルの付いていない黒塗りを、報告書の外(書庫・メールなど)で使うときの割り振り */
export function fallbackLevel(text: string): RedactionLevel {
  const fraction = stableFraction(text);
  if (fraction < 0.3) return "L3";
  if (fraction < 0.6) return "L4";
  return "O5";
}

/** n 個を出現順に L3 → L4 → O5 へ。割り切れないときは O5 を多くする(核心は後ろに来やすい) */
export function levelByOrder(index: number, count: number): RedactionLevel {
  const third = Math.floor(count / 3);
  if (index < third) return "L3";
  if (index < third * 2) return "L4";
  return "O5";
}

/**
 * レベルの付いていない黒塗りに、出現順でレベルを付けた報告書を返す(元の報告書は変えない)。
 * O5限定補遺の中の黒塗りは、O5 でしか読めない場所にあるので O5 にする。
 */
export function withRedactionLevels<T extends StoredReport>(report: T): T {
  // 画面に出る順番(添付資料のキャプションは説明の横に置かれる)
  const order: string[] = [
    report.containmentProcedures,
    report.description,
    report.photoCaption,
    ...report.addenda.map((addendum) => addendum.body),
    report.closingLine,
    ...report.footnotes,
  ];
  const unlabeled = order.reduce((sum, text) => sum + [...text.matchAll(REDACTION)].filter((m) => !m[1]).length, 0);
  if (unlabeled === 0 && ![...report.o5Addendum.body.matchAll(REDACTION)].some((m) => !m[1])) return report;

  let index = 0;
  const label = (text: string) =>
    text.replace(REDACTION, (whole, level: string | undefined, body: string) => (level ? whole : `[[${levelByOrder(index++, unlabeled)}:${body}]]`));
  const labelO5 = (text: string) => text.replace(REDACTION, (whole, level: string | undefined, body: string) => (level ? whole : `[[O5:${body}]]`));

  return {
    ...report,
    containmentProcedures: label(report.containmentProcedures),
    description: label(report.description),
    photoCaption: label(report.photoCaption),
    addenda: report.addenda.map((addendum) => ({ ...addendum, body: label(addendum.body) })),
    closingLine: label(report.closingLine),
    footnotes: report.footnotes.map(label),
    o5Addendum: { ...report.o5Addendum, body: labelO5(report.o5Addendum.body) },
  };
}

/** 黒塗りの中身を、同じくらいの幅の伏せ字にする(未開示の文字を DOM に出さないため) */
export function maskText(text: string): string {
  const length = [...text.replace(/\s+/g, "")].length;
  return "█".repeat(Math.max(2, Math.min(length, 40)));
}
