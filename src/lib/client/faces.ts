"use client";

import type { FaceDetector } from "@mediapipe/tasks-vision";

/**
 * 顔の自動[編集済み]処理。MediaPipe の顔検出をブラウザ内で動かす。
 * 画像はどこにも送らない。読み込めなかった場合は処理を飛ばし、撮影はそのまま続けられる。
 *
 * - 実行環境(WASM)は CDN から読み込む。バージョンは package.json の @mediapipe/tasks-vision と合わせること
 * - モデル(blaze_face_short_range, Apache 2.0)は public/models/ に置いて自前で配信している
 */
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_PATH = "/models/blaze_face_short_range.tflite";

export type FaceBox = { x: number; y: number; width: number; height: number };

let detectorPromise: Promise<FaceDetector | null> | null = null;
let lastTimestamp = 0;

export function loadFaceDetector(): Promise<FaceDetector | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        const create = (delegate: "GPU" | "CPU") =>
          FaceDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_PATH, delegate },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.5,
          });
        try {
          return await create("GPU");
        } catch {
          return await create("CPU");
        }
      } catch (error) {
        console.warn("[faces] 顔検出を読み込めませんでした", error);
        return null;
      }
    })();
  }
  return detectorPromise;
}

/** 映像のフレームや撮影画像から顔を探す。座標は元画像のピクセル単位 */
export function detectFaces(detector: FaceDetector, source: HTMLVideoElement | HTMLCanvasElement): FaceBox[] {
  // VIDEO モードは時刻が単調に増えている必要がある
  const timestamp = Math.max(performance.now(), lastTimestamp + 1);
  lastTimestamp = timestamp;
  try {
    return detector
      .detectForVideo(source, timestamp)
      .detections.flatMap((detection) => (detection.boundingBox ? [detection.boundingBox] : []))
      .map((box) => ({ x: box.originX, y: box.originY, width: box.width, height: box.height }));
  } catch {
    return [];
  }
}

/** 検出枠は顔の中心部だけなので、髪や顎まで隠れるよう少し広げる */
export function padBox(box: FaceBox, maxWidth: number, maxHeight: number): FaceBox {
  const x = Math.max(0, box.x - box.width * 0.2);
  const y = Math.max(0, box.y - box.height * 0.35);
  const right = Math.min(maxWidth, box.x + box.width * 1.2);
  const bottom = Math.min(maxHeight, box.y + box.height * 1.15);
  return { x, y, width: right - x, height: bottom - y };
}

/** 黒塗りと「[編集済み]」を描く。boxes は ctx の座標系に合わせて渡す */
export function drawRedactions(ctx: CanvasRenderingContext2D, boxes: FaceBox[]) {
  for (const box of boxes) {
    ctx.save();
    ctx.fillStyle = "#050505";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    const size = Math.max(10, Math.min(box.width / 6, box.height / 3));
    ctx.font = `bold ${size}px ui-monospace, monospace`;
    ctx.fillStyle = "#e9e6dc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("[編集済み]", box.x + box.width / 2, box.y + box.height / 2, box.width * 0.92);
    ctx.restore();
  }
}

/** 撮影した画像の顔を黒塗りにする。塗った顔の数を返す */
export async function redactFacesOnCanvas(canvas: HTMLCanvasElement): Promise<number> {
  const detector = await loadFaceDetector();
  if (!detector) return 0;
  const boxes = detectFaces(detector, canvas).map((box) => padBox(box, canvas.width, canvas.height));
  if (boxes.length) drawRedactions(canvas.getContext("2d")!, boxes);
  return boxes.length;
}
