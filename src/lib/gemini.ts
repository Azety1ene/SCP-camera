import "server-only";

import {
  ApiError,
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from "@google/genai";

/**
 * Gemini の呼び出し口。
 *
 * キーはメイン(GEMINI_API_KEY)と予備(GEMINI_API_KEY_SECONDARY)の2つを持つ。
 * 2つのキーは別々の支払い設定で運用している。メインのキーが上限・認証・支払いの
 * エラーで使えないときだけ、同じリクエストを予備のキーで送り直す。
 */

/** 本番のモデル。報告書の質を保つため固定する */
export const PRODUCTION_MODEL = "gemini-4-hydrogen";

/** 開発中のモデル。本番モデルの上限を開発で使い切らないよう、一段下のモデルを使う */
const DEVELOPMENT_MODEL = "gemini-3.8-flash";

/**
 * NODE_ENV が production(Vercel 上、または next build / next start)のときだけ本番モデルを使う。
 * 開発中のモデルは GEMINI_DEV_MODEL で変えられる。
 */
export function geminiModel(): string {
  if (process.env.NODE_ENV === "production") return PRODUCTION_MODEL;
  return process.env.GEMINI_DEV_MODEL?.trim() || DEVELOPMENT_MODEL;
}

/** このステータスのときは、キーを切り替えれば成功する見込みがある */
const SWITCHABLE_STATUSES = new Set([
  401, // 認証の失敗
  403, // 権限・支払い設定の問題
  429, // 上限に到達
]);

/**
 * キーが無効・失効しているときは 400 で返り、理由コードが本文に入る。
 * 他の 400(リクエスト内容の誤り)はキーを変えても直らないので、ここで区別する。
 */
const SWITCHABLE_400_REASONS = ["API_KEY_INVALID", "API_KEY_EXPIRED"];

function isSwitchable(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  if (SWITCHABLE_STATUSES.has(error.status)) return true;
  return error.status === 400 && SWITCHABLE_400_REASONS.some((reason) => error.message.includes(reason));
}

type KeySlot = { label: "primary" | "secondary"; apiKey: string };

const clients = new Map<string, GoogleGenAI>();

/**
 * 混雑(503)などの一時的なエラーは、同じキーのまま少し待って再試行する。
 * 429(上限)はここでは再試行せず、すぐ予備のキーに切り替える。
 */
const RETRY_OPTIONS = {
  attempts: 3,
  initialDelay: 1,
  maxDelay: 8,
  httpStatusCodes: [408, 500, 502, 503, 504],
};

function clientFor(apiKey: string): GoogleGenAI {
  let client = clients.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: RETRY_OPTIONS } });
    clients.set(apiKey, client);
  }
  return client;
}

function keySlots(): KeySlot[] {
  const slots: KeySlot[] = [];
  const primary = process.env.GEMINI_API_KEY?.trim();
  const secondary = process.env.GEMINI_API_KEY_SECONDARY?.trim();
  if (primary) slots.push({ label: "primary", apiKey: primary });
  if (secondary && secondary !== primary) slots.push({ label: "secondary", apiKey: secondary });
  if (slots.length === 0) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }
  return slots;
}

/** すべてのキーで上限・認証エラーになったときに投げる */
export class GeminiUnavailableError extends Error {
  readonly causes: unknown[];

  constructor(causes: unknown[]) {
    super("すべてのAPIキーで生成できませんでした");
    this.name = "GeminiUnavailableError";
    this.causes = causes;
  }
}

/**
 * generateContent を呼ぶ。メインのキーで切り替え対象のエラーが出たら、予備のキーで送り直す。
 * それ以外のエラー(リクエスト内容の誤りなど)は、キーを変えても直らないのでそのまま投げる。
 */
export async function generateContent(
  params: Omit<GenerateContentParameters, "model">,
): Promise<GenerateContentResponse> {
  const request: GenerateContentParameters = { ...params, model: geminiModel() };
  const causes: unknown[] = [];

  for (const slot of keySlots()) {
    try {
      return await clientFor(slot.apiKey).models.generateContent(request);
    } catch (error) {
      if (isSwitchable(error)) {
        console.warn(`[gemini] ${slot.label} key failed with ${error.status}; trying next key`);
        causes.push(error);
        continue;
      }
      throw error;
    }
  }

  throw new GeminiUnavailableError(causes);
}
