import { FinishReason, ThinkingLevel } from "@google/genai";
import { generateContent } from "../gemini.ts";
import { buildUserPrompt, SYSTEM_INSTRUCTION } from "./prompt.ts";
import { withRedactionLevels } from "./redaction.ts";
import { reportJsonSchema, reportSchema, type GeneratedReport } from "./schema.ts";
import { planStory, type StoryPlan } from "./tones.ts";

export type ReportResult = {
  itemNumber: string;
  plan: { toneId: string; toneName: string };
  report: GeneratedReport;
  usage?: { thoughtsTokens?: number; outputTokens?: number };
};

/** 生成できたが、報告書として使えない応答だったとき */
export class ReportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportFormatError";
  }
}

/**
 * アイテム番号はサーバー側で決める。既存のJP記事と重なりにくいよう 5000〜9999 から選ぶ。
 */
export function randomItemNumber(random: () => number = Math.random): string {
  return `SCP-${5000 + Math.floor(random() * 5000)}-JP`;
}

export async function generateReport(
  image: { data: string; mimeType: string },
  options: { plan?: StoryPlan; itemNumber?: string; thinkingLevel?: ThinkingLevel } = {},
): Promise<ReportResult> {
  const plan = options.plan ?? planStory();
  const itemNumber = options.itemNumber ?? randomItemNumber();

  const response = await generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.data } },
          { text: buildUserPrompt(plan, itemNumber) },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: reportJsonSchema,
      // 既定は LOW。hydrogen で MEDIUM は約240秒、LOW は約20秒で、質の差は小さかった(関数の実行上限は300秒)
      thinkingConfig: { thinkingLevel: options.thinkingLevel ?? ThinkingLevel.LOW },
    },
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== FinishReason.STOP) {
    throw new ReportFormatError(`生成が途中で止まりました (${finishReason})`);
  }

  const text = response.text;
  if (!text) throw new ReportFormatError("応答が空でした");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ReportFormatError("応答がJSONとして読めませんでした");
  }

  const parsed = reportSchema.safeParse(json);
  if (!parsed.success) {
    throw new ReportFormatError(`応答の形が想定と違いました: ${parsed.error.message}`);
  }

  return {
    itemNumber,
    plan: { toneId: plan.tone.id, toneName: plan.tone.name },
    // レベルを書き忘れた黒塗りがあれば、出現順で割り振っておく(保存・共有される本文はすべてレベル付きにする)
    report: withRedactionLevels(parsed.data),
    usage: {
      thoughtsTokens: response.usageMetadata?.thoughtsTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    },
  };
}
