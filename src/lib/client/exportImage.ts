/** 画面の一部を PNG にして書き出した結果。shared は共有シートを出した、downloaded はダウンロードした */
export type ExportResult = "shared" | "downloaded" | "cancelled";

/**
 * 画面の要素を PNG にして、スマホでは共有シート(写真に保存などができる)、PC ではダウンロードで書き出す。
 * 共有シートが使えない・拒否された場合はダウンロードに切り替える。
 */
export async function exportImage(node: HTMLElement, fileName: string, backgroundColor?: string): Promise<ExportResult> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, { pixelRatio: 2, backgroundColor });
  if (!blob) throw new Error("画像を作成できませんでした");
  const file = new File([blob], fileName, { type: "image/png" });
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  if (isTouchDevice && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // 画像の作成に時間がかかり、タップ直後でないと共有できない制限に掛かった場合など。ダウンロードに切り替える
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
