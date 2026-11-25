"use client";

import type { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * 顔の自動[編集済み]処理。MediaPipe の顔検出をブラウザ内で動かす。画像はどこにも送らない。
 *
 * - 実行環境(WASM)とモデル(blaze_face_short_range, Apache 2.0)は、どちらも public/ から自前で配信する。
 *   WASM は scripts/copy-mediapipe.mjs が node_modules の @mediapipe/tasks-vision から public/mediapipe/wasm に写すので、
 *   パッケージとバージョンがずれない
 * - 映像のプレビュー用(VIDEO モード)と、撮影した静止画用(IMAGE モード)で別々に作る。
 *   VIDEO モードは前のフレームの結果を引き継ぐので、解像度の違う静止画に使うと検出がずれることがある
 * - 読み込みに失敗したら覚えておかず、次に呼ばれたときに読み込み直す
 */
const WASM_BASE = "/mediapipe/wasm";
const MODEL_PATH = "/models/blaze_face_short_range.tflite";

export type FaceBox = { x: number; y: number; width: number; height: number };

type Mode = "VIDEO" | "IMAGE";

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

let filesetPromise: Promise<{ fileset: Fileset; FaceDetector: typeof FaceDetector }> | null = null;
const detectors: Partial<Record<Mode, Promise<FaceDetector | null>>> = {};
let lastTimestamp = 0;

function loadFileset() {
  filesetPromise ??= (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    return { fileset, FaceDetector: vision.FaceDetector };
  })().catch((error) => {
    filesetPromise = null;
    throw error;
  });
  return filesetPromise;
}

function load(mode: Mode): Promise<FaceDetector | null> {
  const existing = detectors[mode];
  if (existing) return existing;
  const promise = (async () => {
    try {
      const { fileset, FaceDetector } = await loadFileset();
      const create = (delegate: "GPU" | "CPU") =>
        FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
          runningMode: mode,
          minDetectionConfidence: 0.5,
        });
      try {
        return await create("GPU");
      } catch {
        return await create("CPU");
      }
    } catch (error) {
      console.warn(`[faces] 顔検出(${mode})を読み込めませんでした`, error);
      // 失敗を覚えておくと、ページを読み込み直すまで二度と使えなくなるので、次の呼び出しで読み込み直す
      delete detectors[mode];
      return null;
    }
  })();
  detectors[mode] = promise;
  return promise;
}

/** 映像のプレビュー用(VIDEO モード)。使えなければ null */
export function loadFaceDetector(): Promise<FaceDetector | null> {
  return load("VIDEO");
}

/** 撮影した静止画用(IMAGE モード)。使えなければ null */
export function loadImageFaceDetector(): Promise<FaceDetector | null> {
  return load("IMAGE");
}

const toBoxes = (result: ReturnType<FaceDetector["detect"]>): FaceBox[] =>
  result.detections
    .flatMap((detection) => (detection.boundingBox ? [detection.boundingBox] : []))
    .map((box) => ({ x: box.originX, y: box.originY, width: box.width, height: box.height }));

/** 映像のフレームから顔を探す(VIDEO モードの検出器を渡す)。座標は元映像のピクセル単位 */
export function detectFaces(detector: FaceDetector, source: HTMLVideoElement): FaceBox[] {
  // VIDEO モードは時刻が単調に増えている必要がある
  const timestamp = Math.max(performance.now(), lastTimestamp + 1);
  lastTimestamp = timestamp;
  try {
    return toBoxes(detector.detectForVideo(source, timestamp));
  } catch {
    return [];
  }
}

/** 静止画から顔を探す(IMAGE モード)。検出器を使えなければ null。座標は画像のピクセル単位 */
export async function detectFacesInImage(source: HTMLCanvasElement): Promise<FaceBox[] | null> {
  const detector = await loadImageFaceDetector();
  if (!detector) return null;
  try {
    return toBoxes(detector.detect(source));
  } catch (error) {
    console.warn("[faces] 静止画の顔検出に失敗しました", error);
    return null;
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

/** 撮影した画像の顔を黒塗りにする。塗った顔の数を返す。顔検出を使えなかったときは null */
export async function redactFacesOnCanvas(canvas: HTMLCanvasElement): Promise<number | null> {
  const found = await detectFacesInImage(canvas);
  if (!found) return null;
  const boxes = found.map((box) => padBox(box, canvas.width, canvas.height));
  if (boxes.length) drawRedactions(canvas.getContext("2d")!, boxes);
  return boxes.length;
}
