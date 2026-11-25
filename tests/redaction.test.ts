import { describe, expect, it } from "vitest";
import { levelByOrder, maskText, withRedactionLevels } from "@/lib/report/redaction.ts";
import { renumberSample, SAMPLE_REPORTS } from "@/lib/report/samples.ts";
import type { StoredReport } from "@/lib/report/schema.ts";

const base: StoredReport = {
  observation: "",
  title: "題名",
  objectClass: "Safe",
  containmentProcedures: "手順 [[一]]",
  description: "説明 [[二]] と [[L3:指定済み]] と [[三]]",
  photoCaption: "写真",
  addenda: [{ heading: "補遺", format: "手記", body: "[[四]]" }],
  o5Addendum: { heading: "O5", format: "手記", body: "真相 [[五]]" },
  footnotes: ["[[六]]"],
  closingLine: "終わり",
};

describe("黒塗りのレベル", () => {
  it("出現順に L3 → L4 → O5 へ割り振り、余りは O5 にする", () => {
    expect([0, 1, 2].map((i) => levelByOrder(i, 3))).toEqual(["L3", "L4", "O5"]);
    expect([0, 1, 2, 3].map((i) => levelByOrder(i, 4))).toEqual(["L3", "L4", "O5", "O5"]);
    expect([0, 1, 2, 3, 4].map((i) => levelByOrder(i, 5))).toEqual(["L3", "L4", "O5", "O5", "O5"]);
  });

  it("レベルのない黒塗りにだけ付け、指定済みと O5 補遺の中はそのまま / O5 にする", () => {
    const labeled = withRedactionLevels(base);
    // 一, 二, 三, 四, 六 の5つ(O5 補遺は数えない)
    expect(labeled.containmentProcedures).toBe("手順 [[L3:一]]");
    expect(labeled.description).toBe("説明 [[L4:二]] と [[L3:指定済み]] と [[O5:三]]");
    expect(labeled.addenda[0].body).toBe("[[O5:四]]");
    expect(labeled.footnotes[0]).toBe("[[O5:六]]");
    expect(labeled.o5Addendum.body).toBe("真相 [[O5:五]]");
    // 元の報告書は変えない
    expect(base.description).toBe("説明 [[二]] と [[L3:指定済み]] と [[三]]");
  });

  it("すべて指定済みなら同じオブジェクトを返す", () => {
    const report = SAMPLE_REPORTS[0].report;
    expect(withRedactionLevels(report)).toBe(report);
  });

  it("見本の報告書は、すべての黒塗りにレベルが付いていて、3段階を使っている", () => {
    for (const sample of SAMPLE_REPORTS) {
      const text = JSON.stringify(sample.report);
      const all = [...text.matchAll(/\[\[([\s\S]+?)\]\]/g)].map((m) => m[1]);
      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(all.every((body) => /^(L3|L4|O5):/.test(body))).toBe(true);
      const levels = new Set(all.map((body) => body.slice(0, 2)));
      expect(levels).toEqual(new Set(["L3", "L4", "O5"]));
    }
  });

  it("伏せ字は中身の文字を含まない", () => {
    expect(maskText("撮影者本人")).toBe("█████");
    expect(maskText("あ")).toBe("██");
    expect(maskText("x".repeat(100))).toHaveLength(40);
  });
});

describe("見本の番号の付け替え", () => {
  it("本文中の番号もまとめて付け替える", () => {
    const sample = SAMPLE_REPORTS[0];
    const old = sample.itemNumber.replace("SCP-", "");
    const renamed = renumberSample(sample, "SCP-9999-JP");
    const text = JSON.stringify(renamed.report);
    expect(renamed.itemNumber).toBe("SCP-9999-JP");
    expect(text).not.toContain(`${old}-JP`);
    expect(text).toContain("9999-JP");
  });
});
