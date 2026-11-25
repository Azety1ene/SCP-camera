import { describe, expect, it } from "vitest";
import { imageHash, readImage, sniffImage } from "@/lib/server/image.ts";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), 0]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

describe("画像の形式の判定", () => {
  it("先頭のバイト列で形式を見分ける", () => {
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(WEBP)).toBe("image/webp");
    expect(sniffImage(HTML)).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it("申告された形式と中身が違えば受け付けない", async () => {
    const disguised = new File([HTML], "a.jpg", { type: "image/jpeg" });
    expect(await readImage(disguised, ["image/jpeg"], 1024)).toMatchObject({ ok: false, status: 415 });
    const mismatch = new File([PNG], "a.jpg", { type: "image/jpeg" });
    expect(await readImage(mismatch, ["image/jpeg", "image/png"], 1024)).toMatchObject({ ok: false, status: 415 });
  });

  it("許可していない形式と、大きすぎる画像は受け付けない", async () => {
    expect(await readImage(new File([PNG], "a.png", { type: "image/png" }), ["image/webp"], 1024)).toMatchObject({ status: 415 });
    expect(await readImage(new File([JPEG], "a.jpg", { type: "image/jpeg" }), ["image/jpeg"], 2)).toMatchObject({ status: 413 });
  });

  it("正しい画像は中身と形式を返す", async () => {
    const result = await readImage(new File([WEBP], "a.webp", { type: "image/webp" }), ["image/webp"], 1024);
    expect(result).toMatchObject({ ok: true, type: "image/webp" });
  });

  it("同じ中身なら同じ指紋になる", () => {
    expect(imageHash(JPEG)).toBe(imageHash(new Uint8Array(JPEG)));
    expect(imageHash(JPEG)).not.toBe(imageHash(PNG));
  });
});

