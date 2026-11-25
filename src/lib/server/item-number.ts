import "server-only";

import { randomItemNumber } from "@/lib/report/generate.ts";
import { hasDatabase } from "./db.ts";
import { takenItemNumbers } from "./shared.ts";

/**
 * 財団データベースにまだない番号を選ぶ。番号の幅(5000〜9999)が狭く、登録が増えると重なりやすいため。
 * DB が使えないときは、確かめずに乱数で決める。
 */
export async function pickItemNumber(random: () => number = Math.random): Promise<string> {
  const candidates = Array.from(new Set(Array.from({ length: 12 }, () => randomItemNumber(random))));
  if (!hasDatabase()) return candidates[0];
  try {
    const taken = await takenItemNumbers(candidates);
    return candidates.find((candidate) => !taken.has(candidate)) ?? candidates[0];
  } catch (error) {
    console.error("[item-number] 登録済みの番号を確かめられませんでした:", error);
    return candidates[0];
  }
}
