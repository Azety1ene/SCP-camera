import { reportSchema, type GeneratedReport } from "./schema.ts";
import tissue from "./samples/tissue.json";
import unfixed from "./samples/unfixed.json";
import waterBottle from "./samples/water-bottle.json";

/**
 * 見本の報告書。REPORT_SOURCE=sample のとき、Gemini を呼ばずにこの中から1つを返す。
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

export function isSampleMode(): boolean {
  return process.env.REPORT_SOURCE === "sample";
}

export function pickSampleReport(random: () => number = Math.random): SampleReport {
  return SAMPLE_REPORTS[Math.floor(random() * SAMPLE_REPORTS.length)];
}
