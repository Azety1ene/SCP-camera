import { describe, expect, it } from "vitest";
import { ADDENDUM_FORMATS } from "@/lib/report/schema.ts";
import { planStory, TONES } from "@/lib/report/tones.ts";

/** 決まった順に値を返す乱数 */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("読後感の型", () => {
  it("型の ID は重ならず、重みはすべて正の数", () => {
    expect(new Set(TONES.map((tone) => tone.id)).size).toBe(TONES.length);
    expect(TONES.every((tone) => tone.weight > 0)).toBe(true);
  });

  it("乱数の端の値でも、いずれかの型を選ぶ", () => {
    expect(planStory(() => 0).tone).toBe(TONES[0]);
    expect(planStory(() => 0.999999).tone).toBe(TONES[TONES.length - 1]);
  });

  it("重みに比例して選ばれる", () => {
    const total = TONES.reduce((sum, tone) => sum + tone.weight, 0);
    // 2番目の型の範囲の中央を引く
    const start = TONES[0].weight / total;
    const mid = start + TONES[1].weight / total / 2;
    expect(planStory(() => mid).tone).toBe(TONES[1]);
  });

  it("補遺の形式の候補は、重ならずに3つ", () => {
    const plan = planStory(sequence(0.1, 0.5, 0.9, 0.3));
    expect(plan.formatHints).toHaveLength(3);
    expect(new Set(plan.formatHints).size).toBe(3);
    expect(plan.formatHints.every((format) => (ADDENDUM_FORMATS as readonly string[]).includes(format))).toBe(true);
  });
});
