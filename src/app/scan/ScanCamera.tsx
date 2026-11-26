"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { cctvTimestamp, decodeImageBlob, drawToCanvas, toCctvJpeg, toSourceJpeg } from "@/lib/client/cctv.ts";
import { newRecordId, saveRecord } from "@/lib/client/db.ts";
import { rememberFiltered, rememberPhoto, rememberShare } from "@/lib/client/upload-cache.ts";
import { useStaff } from "@/lib/client/progress.ts";
import { toShareImage } from "@/lib/client/shared.ts";
import { detectFaces, drawRedactions, loadFaceDetector, loadImageFaceDetector, padBox, redactFacesOnCanvas } from "@/lib/client/faces.ts";
import { play, startHum, stopHum } from "@/lib/client/sound.ts";

type CameraState = "starting" | "live" | "denied" | "unavailable";
type Facing = "environment" | "user";

/** カメラ番号はページを読み込むたびに決まる(映像の表示はクライアントでのみ行うので、サーバーとのずれは出ない) */
const CAM_ID = `CAM-${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")} / SITE-81██`;

/** 走査中に流す状態表示 */
const SCAN_MESSAGES = [
  "異常反応スキャン中",
  "ヒューム値を計測中",
  "ミーム汚染: 検出せず",
  "既知の収容物と照合中",
  "対象を視野中央に収めてください",
];

/** 粗いノイズを描き続ける小さなキャンバス。監視映像の粒子感だけをごく薄く乗せる */
function NoiseLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(canvas.width, canvas.height);
    let frame = 0;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (frame++ % 3) return;
      for (let i = 0; i < image.data.length; i += 4) {
        const v = Math.random() * 255;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    };
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      width={160}
      height={90}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07] mix-blend-screen [image-rendering:pixelated]"
    />
  );
}

/** 工業用監視ファインダーの細いレチクル(無彩色) */
function Reticle() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* 四隅の画角目盛り */}
      <span className="absolute left-4 top-12 h-4 w-4 border-l border-t border-foreground/45" />
      <span className="absolute right-4 top-12 h-4 w-4 border-r border-t border-foreground/45" />
      <span className="absolute bottom-14 left-4 h-4 w-4 border-b border-l border-foreground/45" />
      <span className="absolute bottom-14 right-4 h-4 w-4 border-b border-r border-foreground/45" />
      {/* 中央十字 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="block h-px w-8 bg-foreground/45" />
        <span className="absolute left-1/2 top-1/2 block h-8 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/45" />
        <span className="absolute left-1/2 top-1/2 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 border border-foreground/55" />
      </div>
    </div>
  );
}

/** OSD の時刻と計測値だけを独立して更新し、親のカメラ画面を毎秒描き直さないようにする */
function OsdTelemetry({ camId }: { camId: string }) {
  const [now, setNow] = useState("");
  const [hume, setHume] = useState("1.00");
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const tick = () => {
      setNow(cctvTimestamp(new Date()));
      setHume((0.97 + Math.random() * 0.06).toFixed(2));
    };
    tick();
    const timer = setInterval(tick, 1000);
    const messages = setInterval(() => setMessageIndex((i) => (i + 1) % SCAN_MESSAGES.length), 2800);
    return () => {
      clearInterval(timer);
      clearInterval(messages);
    };
  }, []);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between border-b border-white/15 bg-black/65 px-3 py-1.5 font-mono text-[11px] text-foreground">
        <span className="flex items-center gap-2">
          <span className="font-bold text-seal-text">● REC</span>
          <span>{camId}</span>
        </span>
        <span className="tabular-nums text-foreground/90">{now}</span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-white/15 bg-black/70 px-3 py-1.5 font-mono text-[11px]">
        <span className="truncate text-foreground/90">{SCAN_MESSAGES[messageIndex]}</span>
        <span className="shrink-0 tabular-nums text-muted">
          HUME <span className="text-foreground">{hume}</span> Hm
        </span>
      </div>
    </>
  );
}

export function ScanCamera() {
  const staff = useStaff();
  const clearance = staff?.clearance;
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [faceStatus, setFaceStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  /** 顔検出の読み込みをやり直した回数(やり直すと effect が走り直す) */
  const [faceRetry, setFaceRetry] = useState(0);
  const [facesInView, setFacesInView] = useState(0);
  const [facing, setFacing] = useState<Facing>("environment");
  const [canSwitch, setCanSwitch] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const camId = CAM_ID;

  // カメラの起動
  useEffect(() => {
    if (!clearance) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      setState("starting");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setState("live");
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setCanSwitch(devices.filter((device) => device.kind === "videoinput").length > 1);
      } catch (error) {
        if (cancelled) return;
        setState(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "unavailable");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [clearance, facing]);

  // 顔検出の準備。GPU 初期化の競合を避けるため、プレビュー用と静止画用を順に読み込む
  useEffect(() => {
    if (!clearance) return;
    let cancelled = false;
    (async () => {
      const video = await loadFaceDetector();
      if (cancelled) return;
      const image = await loadImageFaceDetector();
      if (!cancelled) setFaceStatus(video && image ? "ready" : "unavailable");
    })();
    return () => {
      cancelled = true;
    };
  }, [clearance, faceRetry]);

  // 映像に映った顔を、プレビュー上でも黒塗りにする(約8回/秒)
  useEffect(() => {
    if (state !== "live" || faceStatus !== "ready") return;
    let timer = 0;
    let lastCount = -1;
    let stopped = false;
    const tick = async () => {
      const detector = await loadFaceDetector();
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (stopped || !detector || !video || !overlay || video.paused) return;
      const width = overlay.clientWidth;
      const height = overlay.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      if (overlay.width !== Math.round(width * ratio)) overlay.width = Math.round(width * ratio);
      if (overlay.height !== Math.round(height * ratio)) overlay.height = Math.round(height * ratio);
      const ctx = overlay.getContext("2d")!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
      const offsetX = (width - video.videoWidth * scale) / 2;
      const offsetY = (height - video.videoHeight * scale) / 2;
      const boxes = detectFaces(detector, video).map((box) => {
        const padded = padBox(box, video.videoWidth, video.videoHeight);
        return { x: padded.x * scale + offsetX, y: padded.y * scale + offsetY, width: padded.width * scale, height: padded.height * scale };
      });
      drawRedactions(ctx, boxes);
      if (boxes.length !== lastCount) {
        lastCount = boxes.length;
        setFacesInView(boxes.length);
      }
    };
    timer = window.setInterval(tick, 120);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [state, faceStatus]);

  // 観測中の環境音
  useEffect(() => {
    if (state !== "live") return;
    startHum();
    return () => stopHum();
  }, [state]);

  async function record(canvas: HTMLCanvasElement) {
    const at = new Date();
    setCaptureError("");
    const faces = await redactFacesOnCanvas(canvas);
    const [photo, photoFiltered] = await Promise.all([toSourceJpeg(canvas), toCctvJpeg(canvas, { camId, at })]);
    const photoShare = await toShareImage(photoFiltered).catch(() => undefined);
    const id = newRecordId();
    await rememberPhoto(id, photo);
    rememberFiltered(id, photoFiltered);
    if (photoShare) rememberShare(id, photoShare);
    await saveRecord(
      { id, createdAt: at.getTime(), status: "pending", faceCheck: faces === null ? "skipped" : "done" },
      { photo, photoFiltered, photoShare },
    );
    router.push(`/report/${id}`);
    setCapturing(false);
    setFlash(false);
  }

  async function onShutter() {
    const video = videoRef.current;
    if (!video || state !== "live" || capturing || video.videoWidth <= 0 || video.videoHeight <= 0) return;
    setCapturing(true);
    setFlash(true);
    play("shutter");
    video.pause();
    try {
      await record(drawToCanvas(video));
    } catch (error) {
      console.error("[scan] 記録できませんでした", error);
      const code = error instanceof Error && error.name ? ` (${error.name})` : "";
      setCaptureError(`記録に失敗しました。もう一度撮影してください。${code}`);
      setCapturing(false);
      setFlash(false);
      video.play().catch(() => {});
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setCapturing(true);
    setCaptureError("");
    try {
      let canvas: HTMLCanvasElement;
      try {
        canvas = await decodeImageBlob(file);
      } catch (error) {
        console.error("[scan] 画像を読み込めませんでした", error);
        setCaptureError("記録画像を読み込めませんでした。別の画像を選んでください。");
        setCapturing(false);
        return;
      }
      await record(canvas);
    } catch (error) {
      console.error("[scan] 記録できませんでした", error);
      const code = error instanceof Error && error.name ? ` (${error.name})` : "";
      setCaptureError(`記録の保存に失敗しました。もう一度お試しください。${code}`);
      setCapturing(false);
    } finally {
      // 読み込み後に空にすることで、iOS Safari でのファイル参照消失を防ぎつつ同じファイルの再選択も可能にする
      input.value = "";
    }
  }

  function onSwitchCamera() {
    play("tap");
    setFacing((current) => (current === "environment" ? "user" : "environment"));
  }

  if (!clearance) {
    return <p className="px-4 py-12 font-mono text-xs text-muted">職員認証を確認中 …</p>;
  }

  return (
    <TerminalShell staff={staff} screen={{ id: "OBS-0200", name: "観測" }} bare>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col border-x border-line/60 bg-black">
        {/* 映像ファインダー */}
        <div className="relative flex-1 overflow-hidden bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover [filter:grayscale(1)_contrast(1.25)_brightness(0.92)_sepia(0.18)_hue-rotate(40deg)_saturate(0.65)]"
          />
          <canvas ref={overlayRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
          <NoiseLayer />
          <Reticle />
          <OsdTelemetry camId={camId} />

          {/* カメラが使えないとき */}
          {(state === "denied" || state === "unavailable") && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/95 px-6 text-center text-sm leading-7">
              <div className="w-full max-w-sm border border-line-strong bg-panel p-5">
                <p className="font-mono text-xs font-bold text-danger">映像入力なし // NO SIGNAL</p>
                <p className="mt-2 text-xs leading-6 text-muted">
                  {state === "denied"
                    ? "カメラへのアクセスが拒否されました。ブラウザの設定でカメラを許可するか、記録画像を読み込んでください。"
                    : "この端末ではカメラを利用できません。記録画像を読み込んで照会できます。"}
                </p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={capturing}
                  className="btn btn-primary mt-4 w-full"
                >
                  {capturing ? "画像を処理中 …" : "記録画像を読み込む"}
                </button>
                {captureError && (
                  <p role="alert" className="mt-3 text-xs text-danger">
                    {captureError}
                  </p>
                )}
              </div>
            </div>
          )}
          {state === "starting" && (
            <p className="absolute inset-0 flex items-center justify-center font-mono text-xs text-muted">
              観測モジュールを起動中 …
            </p>
          )}
          {flash && <div aria-hidden className="flash pointer-events-none absolute inset-0 bg-white" />}
        </div>

        {/* 状態バー(エラー・顔認識) */}
        <div className="border-t border-line bg-sunken px-3 py-1.5 font-mono text-[11px]">
          {captureError ? (
            <p role="alert" className="text-danger">
              [異常] {captureError}
            </p>
          ) : facesInView > 0 ? (
            <p className="text-warn">人物検出({facesInView}) ── 顔領域を自動[編集済み]処理中</p>
          ) : faceStatus === "unavailable" ? (
            <p role="status" className="flex flex-wrap items-center justify-between gap-2 text-warn">
              <span>顔自動編集: 無効(人物の顔は編集されません)</span>
              <button
                type="button"
                onClick={() => {
                  setFaceStatus("loading");
                  setFaceRetry((n) => n + 1);
                }}
                className="underline text-foreground"
              >
                再試行
              </button>
            </p>
          ) : (
            <p className="flex items-center justify-between text-muted">
              <span>顔自動編集: {faceStatus === "ready" ? "待機中(有効)" : "準備中 …"}</span>
              <span>画角: {facing === "environment" ? "背面" : "前面"}</span>
            </p>
          )}
        </div>

        {/* 機器操作パネル */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-line-strong bg-panel px-4 py-3">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={capturing}
              className="btn btn-secondary min-w-20 px-3 font-mono text-xs"
            >
              画像読込
            </button>
          </div>

          <button
            type="button"
            onClick={onShutter}
            disabled={state !== "live" || capturing}
            aria-label="対象を記録する"
            className="flex h-16 w-16 items-center justify-center border-2 border-foreground bg-sunken p-1.5 transition-transform active:translate-y-px disabled:opacity-40"
          >
            <span className="flex h-full w-full items-center justify-center bg-foreground font-mono text-[11px] font-bold text-background">
              {capturing ? "処理" : "記録"}
            </span>
          </button>

          <div className="flex justify-end">
            {canSwitch ? (
              <button
                type="button"
                onClick={onSwitchCamera}
                disabled={capturing}
                aria-label={facing === "environment" ? "前面のカメラに切り替える" : "背面のカメラに切り替える"}
                className="btn btn-secondary min-w-20 px-3 font-mono text-xs"
              >
                カメラ切替
              </button>
            ) : (
              <span className="font-mono text-[11px] text-muted">{capturing ? "記録中 …" : "待機"}</span>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </TerminalShell>
  );
}
