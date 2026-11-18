"use client";

/**
 * 撮影画像の処理。
 * - toSourceJpeg: 生成に送る元画像(長辺1280px、JPEG。canvas を通すのでEXIFや位置情報は付かない)
 * - toCctvJpeg:   報告書に添付する、監視カメラ風に加工した画像
 */

const MAX_EDGE = 1280;

type Drawable = HTMLVideoElement | HTMLImageElement | ImageBitmap;

function sourceSize(source: Drawable): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight };
  return { width: source.width, height: source.height };
}

function fit(width: number, height: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("画像を作成できませんでした"))), "image/jpeg", quality);
  });
}

export function drawToCanvas(source: Drawable): HTMLCanvasElement {
  const size = sourceSize(source);
  const { width, height } = fit(size.width, size.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(source, 0, 0, width, height);
  return canvas;
}

export async function toSourceJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return canvasToBlob(canvas);
}

function pad(n: number, size = 2) {
  return String(n).padStart(size, "0");
}

export function cctvTimestamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 監視カメラ風の加工。canvas の filter に頼らず画素を直接いじるので、Safari でも同じ見た目になる。
 */
export async function toCctvJpeg(source: HTMLCanvasElement, options: { camId: string; at: Date }): Promise<Blob> {
  const { width, height } = source;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0);

  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.hypot(cx, cy);

  for (let y = 0; y < height; y++) {
    // 走査線:3行ごとに少し暗くする
    const scan = y % 3 === 0 ? 0.82 : 1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luma = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      // コントラストを上げて、黒を少し浮かせる
      let v = (luma - 128) * 1.25 + 128 + 10;
      // 周辺減光
      const vignette = 1 - Math.pow(Math.hypot(x - cx, y - cy) / maxDist, 2.2) * 0.55;
      // ノイズ
      v = (v + (Math.random() - 0.5) * 38) * scan * vignette;
      v = Math.max(0, Math.min(255, v));
      // 緑がかった単色
      px[i] = v * 0.78;
      px[i + 1] = v * 0.95;
      px[i + 2] = v * 0.8;
    }
  }
  ctx.putImageData(image, 0, 0);

  // オーバーレイ文字
  const unit = Math.max(12, Math.round(width / 42));
  ctx.font = `${unit}px ui-monospace, monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(225, 240, 220, 0.9)";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 4;
  const margin = Math.round(unit * 0.9);
  ctx.fillText(options.camId, margin, margin);
  ctx.textAlign = "right";
  ctx.fillText(cctvTimestamp(options.at), width - margin, margin);
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(230, 90, 80, 0.95)";
  ctx.fillText("● REC", margin, height - margin);

  return canvasToBlob(canvas, 0.8);
}
