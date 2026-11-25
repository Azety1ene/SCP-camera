import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * POST /api/shared の入力の検証。DB と Blob は差し替え、Cookie は有効なセッションを返すようにする
 */

const cookie = { value: "" };
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => cookie }) }));

const insertShared = vi.fn(async () => true);
const findByTokenHash = vi.fn(async () => null as string | null);
const rotateDeleteKey = vi.fn(async () => {});
vi.mock("@/lib/server/shared.ts", () => ({
  insertShared,
  findByTokenHash,
  rotateDeleteKey,
  listShared: vi.fn(),
  decodeCursor: () => null,
}));
const uploadSharedImage = vi.fn(async () => ({ url: "https://blob.example/shared/x.webp" }));
const deleteSharedImage = vi.fn(async () => {});
vi.mock("@/lib/server/blob.ts", () => ({ UPLOAD_ACCESS: "private", uploadSharedImage, deleteSharedImage }));

const { POST } = await import("@/app/api/shared/route.ts");
const { encodeSession } = await import("@/lib/session.ts");
const { signReport } = await import("@/lib/report/token.ts");
const { imageHash } = await import("@/lib/server/image.ts");
const { SAMPLE_REPORTS } = await import("@/lib/report/samples.ts");

const WEBP = new Uint8Array([...Buffer.from("RIFF"), 1, 2, 3, 4, ...Buffer.from("WEBP"), 9, 9, 9]);
const sample = SAMPLE_REPORTS[0];
const tokenFor = (bytes: Uint8Array, issuedAt = Date.now()) =>
  signReport({ itemNumber: sample.itemNumber, tone: sample.tone, report: sample.report, imageHash: imageHash(bytes) }, issuedAt);

function request(fields: { token?: string; image?: File; observatory?: string }) {
  const form = new FormData();
  if (fields.token) form.append("token", fields.token);
  if (fields.image) form.append("image", fields.image);
  form.append("observatory", fields.observatory ?? "81-OP-1234");
  return new Request("http://localhost/api/shared", { method: "POST", body: form });
}

const webpFile = (bytes: Uint8Array<ArrayBuffer> = WEBP, type = "image/webp") => new File([bytes], "a.webp", { type });

describe("POST /api/shared", () => {
  beforeEach(() => {
    cookie.value = encodeSession({ clearance: "L2", issuedAt: Date.now() });
    vi.clearAllMocks();
    findByTokenHash.mockResolvedValue(null);
    insertShared.mockResolvedValue(true);
  });

  it("職員認証がなければ 401", async () => {
    cookie.value = "";
    const res = await POST(request({ token: tokenFor(WEBP), image: webpFile() }));
    expect(res.status).toBe(401);
  });

  it("正しい登録票と、照会時と同じ画像なら登録する", async () => {
    const res = await POST(request({ token: tokenFor(WEBP), image: webpFile() }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; deleteKey: string };
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.deleteKey).toBeTruthy();
    expect(uploadSharedImage).toHaveBeenCalledOnce();
    expect(insertShared).toHaveBeenCalledWith(expect.objectContaining({ imageAccess: "private", observatory: "81-OP-1234" }));
  });

  it("照会時と違う画像は受け付けない", async () => {
    const other = new Uint8Array([...WEBP.slice(0, 12), 1, 1, 1]);
    const res = await POST(request({ token: tokenFor(WEBP), image: webpFile(other) }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("image_mismatch");
    expect(uploadSharedImage).not.toHaveBeenCalled();
  });

  it("中身が画像でないファイルは 415", async () => {
    const html = new TextEncoder().encode("<svg onload=alert(1)>");
    const res = await POST(request({ token: tokenFor(html), image: webpFile(html) }));
    expect(res.status).toBe(415);
  });

  it("期限切れの登録票は token_expired", async () => {
    const res = await POST(request({ token: tokenFor(WEBP, Date.now() - 31 * 24 * 60 * 60 * 1000), image: webpFile() }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("token_expired");
  });

  it("署名の正しくない登録票は invalid_token", async () => {
    const res = await POST(request({ token: "abc.def", image: webpFile() }));
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_token");
  });

  it("同時に送られて先に登録されていたら、画像を消して既存の記録を返す", async () => {
    insertShared.mockResolvedValue(false);
    findByTokenHash.mockResolvedValueOnce(null).mockResolvedValueOnce("existing-id");
    const res = await POST(request({ token: tokenFor(WEBP), image: webpFile() }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string; duplicate?: boolean })).toMatchObject({ id: "existing-id", duplicate: true });
    expect(deleteSharedImage).toHaveBeenCalledOnce();
    expect(rotateDeleteKey).toHaveBeenCalledOnce();
  });

  it("観測所番号の形でない値は保存しない", async () => {
    await POST(request({ token: tokenFor(WEBP), image: webpFile(), observatory: "<script>" }));
    expect(insertShared).toHaveBeenCalledWith(expect.objectContaining({ observatory: null }));
  });
});
