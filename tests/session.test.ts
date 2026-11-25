import { afterEach, describe, expect, it, vi } from "vitest";
import { clearanceForCode, decodeSession, encodeSession, SESSION_MAX_AGE } from "@/lib/session.ts";

describe("session", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("署名した値を読み戻せる", () => {
    const value = encodeSession({ clearance: "O5", issuedAt: Date.now() });
    expect(decodeSession(value)?.clearance).toBe("O5");
  });

  it("書き換えた値や署名は受け付けない", () => {
    const value = encodeSession({ clearance: "L2", issuedAt: Date.now() });
    const [, signature] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ clearance: "O5", issuedAt: Date.now() })).toString("base64url");
    expect(decodeSession(`${forged}.${signature}`)).toBeNull();
    expect(decodeSession(`${value.split(".")[0]}.AAAA`)).toBeNull();
  });

  it("区切りがちょうど1つでない値は受け付けない", () => {
    const value = encodeSession({ clearance: "L2", issuedAt: Date.now() });
    expect(decodeSession(`${value}.extra`)).toBeNull();
    expect(decodeSession(value.replace(".", ""))).toBeNull();
    expect(decodeSession("")).toBeNull();
    expect(decodeSession(undefined)).toBeNull();
  });

  it("期限切れと、発行時刻のない値は受け付けない", () => {
    const old = encodeSession({ clearance: "L2", issuedAt: Date.now() - SESSION_MAX_AGE * 1000 - 1 });
    expect(decodeSession(old)).toBeNull();
    const noTime = encodeSession({ clearance: "L2" } as never);
    expect(decodeSession(noTime)).toBeNull();
  });

  it("想定外のクリアランスは受け付けない", () => {
    expect(decodeSession(encodeSession({ clearance: "L4" as never, issuedAt: Date.now() }))).toBeNull();
  });

  it("合言葉からクリアランスを決める(前後の空白は無視)", () => {
    vi.stubEnv("ACCESS_CODE_LEVEL2", "observer");
    vi.stubEnv("ACCESS_CODE_O5", "council");
    expect(clearanceForCode(" observer ")).toBe("L2");
    expect(clearanceForCode("council")).toBe("O5");
    expect(clearanceForCode("Observer")).toBeNull();
    expect(clearanceForCode("")).toBeNull();
  });

  it("合言葉が設定されていなければ、どの入力も通さない", () => {
    vi.stubEnv("ACCESS_CODE_LEVEL2", "");
    vi.stubEnv("ACCESS_CODE_O5", "");
    expect(clearanceForCode("anything")).toBeNull();
  });
});
