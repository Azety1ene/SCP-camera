import { describe, expect, it } from "vitest";
import { REPORT_TOKEN_MAX_AGE_MS, signReport, tokenHash, verifyReport } from "@/lib/report/token.ts";
import { SAMPLE_REPORTS } from "@/lib/report/samples.ts";

const sample = SAMPLE_REPORTS[0];
const body = { itemNumber: sample.itemNumber, tone: sample.tone, report: sample.report, imageHash: "abc123" };

describe("登録票", () => {
  it("署名した報告書と画像の指紋を読み戻せる", () => {
    const result = verifyReport(signReport(body));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imageHash).toBe("abc123");
      expect(result.value.report.title).toBe(sample.report.title);
    }
  });

  it("中身を書き換えると受け付けない", () => {
    const token = signReport(body);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...body, imageHash: "other", issuedAt: Date.now() })).toString("base64url");
    expect(verifyReport(`${forged}.${signature}`)).toEqual({ ok: false, reason: "invalid" });
  });

  it("区切りがちょうど1つでない値は受け付けない", () => {
    const token = signReport(body);
    expect(verifyReport(`${token}.x`).ok).toBe(false);
    expect(verifyReport("onlyone").ok).toBe(false);
  });

  it("30日を過ぎた登録票は期限切れ", () => {
    const issued = Date.now() - REPORT_TOKEN_MAX_AGE_MS - 1000;
    expect(verifyReport(signReport(body, issued))).toEqual({ ok: false, reason: "expired" });
    expect(verifyReport(signReport(body, Date.now() - REPORT_TOKEN_MAX_AGE_MS + 60_000)).ok).toBe(true);
  });

  it("画像の指紋がない(古い形式の)登録票は受け付けない", () => {
    const legacy = signReport({ ...body, imageHash: "" });
    expect(verifyReport(legacy).ok).toBe(false);
  });

  it("指紋は登録票ごとに異なる", () => {
    expect(tokenHash("a")).not.toBe(tokenHash("b"));
    expect(tokenHash("a")).toMatch(/^[0-9a-f]{64}$/);
  });
});
