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
  if (size.width <= 0 || size.height <= 0) {
    throw new Error("画像のサイズを取得できませんでした");
  }
  const { width, height } = fit(size.width, size.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * 選択した画像ファイル(または Blob)を canvas に描ける形へデコードする。
 * iOS Safari 等で createImageBitmap のオプションや一部形式が失敗することがあるため、
 * 段階的に <img> 読み込みへフォールバックする。
 */
export async function decodeImageBlob(blob: Blob): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      try {
        return drawToCanvas(bitmap);
      } finally {
        bitmap.close();
      }
    } catch {
      try {
        const bitmap = await createImageBitmap(blob);
        try {
          return drawToCanvas(bitmap);
        } finally {
          bitmap.close();
        }
      } catch {
        // 下の <img> フォールバックへ
      }
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("画像を読み込めませんでした"));
      el.src = url;
    });
    return drawToCanvas(img);
  } finally {
    URL.revokeObjectURL(url);
  }
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
  const maxDistSq = cx * cx + cy * cy;

  // 周辺減光: 中心からの距離の2乗(0〜1)ごとの明るさを先に表にしておく。
  // 画素ごとに平方根や累乗を計算すると、スマホでシャッター直後に固まるため
  const VIGNETTE_STEPS = 1024;
  const vignetteTable = new Float32Array(VIGNETTE_STEPS + 1);
  for (let i = 0; i <= VIGNETTE_STEPS; i++) vignetteTable[i] = 1 - Math.pow(i / VIGNETTE_STEPS, 1.1) * 0.55; // (d/max)^2.2 = (d²/max²)^1.1

  for (let y = 0; y < height; y++) {
    // 走査線:3行ごとに少し暗くする
    const scan = y % 3 === 0 ? 0.82 : 1;
    const dySq = (y - cy) * (y - cy);
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      const luma = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      // コントラストを上げて、黒を少し浮かせる
      let v = (luma - 128) * 1.25 + 128 + 10;
      const dx = x - cx;
      const vignette = vignetteTable[((dx * dx + dySq) / maxDistSq) * VIGNETTE_STEPS | 0];
      // ノイズ
      v = (v + (Math.random() - 0.5) * 38) * scan * vignette;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
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
