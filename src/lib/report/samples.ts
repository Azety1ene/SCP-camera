import { reportSchema, type GeneratedReport } from "./schema.ts";
import tissue from "./samples/tissue.json";
import unfixed from "./samples/unfixed.json";
import waterBottle from "./samples/water-bottle.json";

/**
 * 見本の報告書。どの写真を撮っても、Gemini を呼ばずにこの中から1つを返す。
 * Gemini での生成は REPORT_SOURCE=gemini と明示したときだけ有効になる。
 * - tissue / water-bottle: 開発中に gemini-4-hydrogen で生成したもの(water-bottle は一部を手直し)
 * - unfixed: どの写真に添付されても成り立つよう手書きしたもの
 */
export type SampleReport = { itemNumber: string; tone: string; report: GeneratedReport };

export const SAMPLE_REPORTS: SampleReport[] = [tissue, waterBottle, unfixed].map((sample) => ({
  itemNumber: sample.itemNumber,
  tone: sample.tone,
  // JSON の形がスキーマとずれていたら、ここで気付けるようにする
  report: reportSchema.parse(sample.report),
}));

/** 初期設定は見本。設定の消し忘れや書き間違いで、うっかり Gemini を呼ばないようにしている */
export function isSampleMode(): boolean {
  return process.env.REPORT_SOURCE?.trim() !== "gemini";
}

export function pickSampleReport(random: () => number = Math.random): SampleReport {
  return SAMPLE_REPORTS[Math.floor(random() * SAMPLE_REPORTS.length)];
}

/**
 * 見本の報告書の番号を付け替える。見本は3件しかないので、そのままでは財団データベースで番号が重なる。
 * 本文中の「SCP-7293-JP」「補遺7293-JP-1」なども、まとめて新しい番号にする
 */
export function renumberSample(sample: SampleReport, itemNumber: string): SampleReport {
  const from = sample.itemNumber.replace(/^SCP-/, "");
  const to = itemNumber.replace(/^SCP-/, "");
  if (from === to) return sample;
  const report = JSON.parse(JSON.stringify(sample.report).split(from).join(to)) as GeneratedReport;
  return { ...sample, itemNumber, report };
}
