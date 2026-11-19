import { z } from "zod";

/**
 * 生成する報告書の形。
 *
 * 本文中の記法:
 * - `[[...]]` 物語の核心。クリアランスレベル2では黒塗り、O5では読める
 * - `██`      常に伏せる箇所(人名・日付・地名など)
 * - `[注1]`   脚注への参照(footnotes の1番目)
 */

export const OBJECT_CLASSES = ["Safe", "Euclid", "Keter", "Thaumiel", "Neutralized"] as const;

/** 異常分類システム(ACS)の撹乱クラス。影響が広がる範囲(左ほど狭い) */
export const DISRUPTION_CLASSES = ["Dark", "Vlam", "Keneq", "Ekhi", "Amida"] as const;

/** ACSのリスククラス。影響を受けた人への危険度(左ほど低い) */
export const RISK_CLASSES = ["Notice", "Caution", "Warning", "Danger", "Critical"] as const;

export const ADDENDUM_FORMATS = [
  "実験ログ",
  "インタビュー記録",
  "事案記録",
  "探査ログ",
  "手記",
  "手紙",
  "製品文書",
  "改訂前の記録",
  "注記付き文書",
  "対象と結果の表",
  "一人称の記録",
  "公的書式",
  "上位者の書状",
] as const;

const addendum = z.object({
  heading: z.string().describe("補遺の見出し。例: 補遺XXXX-JP-1: 実験記録"),
  format: z.enum(ADDENDUM_FORMATS).describe("この補遺の記録形式"),
  body: z.string().describe("補遺の本文。改行は \\n で表す"),
});

export const reportSchema = z.object({
  observation: z
    .string()
    .describe("写真の観察メモ。色・形・傷・印字・置かれた場所・周囲に写っている物を具体的に列挙する。画面には表示しない"),
  title: z.string().describe("報告書の題名。言葉遊びを含む短い日本語"),
  objectClass: z.enum(OBJECT_CLASSES),
  disruptionClass: z.enum(DISRUPTION_CLASSES).describe("撹乱クラス。異常の影響がどこまで広がるか(Dark: ほぼ広がらない 〜 Amida: 世界規模)"),
  riskClass: z.enum(RISK_CLASSES).describe("リスククラス。影響を受けた人にとっての危険度(Notice: ほぼ無害 〜 Critical: 即座に回復不能)"),
  containmentProcedures: z.string().describe("特別収容プロトコル"),
  description: z.string().describe("説明"),
  photoCaption: z.string().describe("添付された撮影写真のキャプション(1〜2文)"),
  addenda: z.array(addendum).min(1).max(3).describe("補遺。1〜3個"),
  o5Addendum: addendum.describe("O5権限でのみ閲覧できる補遺。レベル2で伏せた核心に関わる真相を明かす"),
  footnotes: z.array(z.string()).max(4).describe("脚注。本文中の [注1] などに対応する"),
  closingLine: z.string().describe("報告書の最後に置く一文。読後感を決める"),
});

export type GeneratedReport = z.infer<typeof reportSchema>;

/** 保存済みの報告書。ACSの項目が加わる前に作られたものは、撹乱・リスクを持たない */
export type StoredReport = Omit<GeneratedReport, "disruptionClass" | "riskClass"> &
  Partial<Pick<GeneratedReport, "disruptionClass" | "riskClass">>;

/** Gemini に渡す JSON Schema */
export const reportJsonSchema = z.toJSONSchema(reportSchema, { target: "draft-2020-12" });
