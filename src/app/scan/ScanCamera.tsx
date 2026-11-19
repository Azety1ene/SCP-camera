"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { cctvTimestamp, drawToCanvas, toCctvJpeg, toSourceJpeg } from "@/lib/client/cctv.ts";
import { newRecordId, saveRecord } from "@/lib/client/db.ts";
import { useRequireClearance } from "@/lib/client/session.ts";
import { detectFaces, drawRedactions, loadFaceDetector, padBox, redactFacesOnCanvas } from "@/lib/client/faces.ts";
import { play, startHum, stopHum } from "@/lib/client/sound.ts";

type CameraState = "starting" | "live" | "denied" | "unavailable";

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

/** 粗いノイズを描き続ける小さなキャンバス。拡大表示して砂嵐に見せる */
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
      if (frame++ % 3) return; // 約20fpsで十分
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
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.09] mix-blend-screen [image-rendering:pixelated]"
    />
  );
}

function Corners() {
  const base = "absolute h-8 w-8 border-accent/70";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-5">
      <span className={`${base} left-0 top-0 border-l-2 border-t-2`} />
      <span className={`${base} right-0 top-0 border-r-2 border-t-2`} />
      <span className={`${base} bottom-0 left-0 border-b-2 border-l-2`} />
      <span className={`${base} bottom-0 right-0 border-b-2 border-r-2`} />
    </div>
  );
}

export function ScanCamera() {
  const clearance = useRequireClearance();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [now, setNow] = useState("");
  const [hume, setHume] = useState("1.00");
  const [messageIndex, setMessageIndex] = useState(0);
  const [faceStatus, setFaceStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [facesInView, setFacesInView] = useState(0);
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
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setState("live");
      } catch (error) {
        if (cancelled) return;
        setState(error instanceof DOMException && error.name === "NotAllowedError" ? "denied" : "unavailable");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [clearance]);

  // 顔検出の準備
  useEffect(() => {
    if (!clearance) return;
    let cancelled = false;
    loadFaceDetector().then((detector) => {
      if (!cancelled) setFaceStatus(detector ? "ready" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [clearance]);

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
      // video は object-cover で表示しているので、同じ拡大・切り取りで座標を合わせる
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

  // 時刻・計測値・状態表示の更新
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(cctvTimestamp(new Date()));
      setHume((0.97 + Math.random() * 0.06).toFixed(2));
    }, 1000);
    const messages = setInterval(() => setMessageIndex((i) => (i + 1) % SCAN_MESSAGES.length), 2600);
    return () => {
      clearInterval(timer);
      clearInterval(messages);
    };
  }, []);

  async function record(canvas: HTMLCanvasElement) {
    const at = new Date();
    // 人が写っていたら、生成に送る画像と添付資料の両方で顔を黒塗りにする
    await redactFacesOnCanvas(canvas);
    const [photo, photoFiltered] = await Promise.all([toSourceJpeg(canvas), toCctvJpeg(canvas, { camId, at })]);
    const id = newRecordId();
    await saveRecord({ id, createdAt: at.getTime(), status: "pending", photo, photoFiltered });
    router.push(`/report/${id}`);
  }

  async function onShutter() {
    const video = videoRef.current;
    if (!video || state !== "live" || capturing) return;
    setCapturing(true);
    setFlash(true);
    play("shutter");
    video.pause();
    try {
      await record(drawToCanvas(video));
    } catch {
      setCapturing(false);
      video.play();
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCapturing(true);
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      await record(drawToCanvas(bitmap));
    } catch {
      setCapturing(false);
    }
  }

  if (!clearance) {
    return <p className="px-4 py-12 text-sm text-muted">職員認証を確認中 …</p>;
  }

  return (
    <TerminalShell clearance={clearance} bare>
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover [filter:grayscale(1)_contrast(1.3)_brightness(0.9)_sepia(0.35)_hue-rotate(55deg)_saturate(0.8)]"
        />
        {/* 顔の黒塗り(プレビュー用) */}
        <canvas ref={overlayRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
        <NoiseLayer />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-transparent via-accent/10 to-transparent sweep" />
        <Corners />

        {/* 映像上の表示 */}
        <div className="pointer-events-none absolute inset-x-8 top-7 flex justify-between text-[11px] text-foreground/90 glow">
          <span>{camId}</span>
          <span className="tabular-nums">{now}</span>
        </div>
        <div className="pointer-events-none absolute left-8 top-12 text-[11px] text-danger">
          <span className="cursor">● REC</span>
        </div>
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 border border-accent/40">
          <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 bg-accent/80" />
        </div>
        <div className="pointer-events-none absolute inset-x-8 bottom-36 flex items-end justify-between text-[11px] text-accent glow">
          <span key={messageIndex} className="glitch-in">
            {SCAN_MESSAGES[messageIndex]} …
          </span>
          <span className="tabular-nums">ヒューム値 {hume} Hm</span>
        </div>
        <div className="pointer-events-none absolute inset-x-8 bottom-[7.5rem] text-[11px]">
          {facesInView > 0 ? (
            <span className="text-warn">人物を検出 ── 自動編集を適用中({facesInView})</span>
          ) : (
            <span className="text-muted">
              顔認識 {faceStatus === "ready" ? "有効" : faceStatus === "loading" ? "準備中 …" : "無効"}
            </span>
          )}
        </div>

        {/* カメラが使えないとき */}
        {(state === "denied" || state === "unavailable") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/90 px-8 text-center text-sm leading-7">
            <p className="text-danger">観測モジュールに接続できません</p>
            <p className="text-muted">
              {state === "denied"
                ? "カメラへのアクセスが拒否されました。ブラウザの設定でカメラを許可してください。"
                : "この端末ではカメラを利用できません。"}
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="pointer-events-auto border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background"
            >
              記録画像を読み込む
            </button>
          </div>
        )}
        {state === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">観測モジュールを起動中 …</p>
        )}

        {/* 操作 */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-10 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={capturing}
            className="w-16 text-[11px] text-muted hover:text-foreground disabled:opacity-40"
          >
            画像を
            <br />
            読み込む
          </button>
          <button
            type="button"
            onClick={onShutter}
            disabled={state !== "live" || capturing}
            aria-label="対象を記録する"
            className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent/80 disabled:opacity-40"
          >
            <span className="h-14 w-14 rounded-full bg-accent/85 transition-transform active:scale-90" />
          </button>
          <span className="w-16 text-center text-[11px] text-muted">{capturing ? "記録中" : "記録"}</span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

        {flash && <div aria-hidden className="flash pointer-events-none absolute inset-0 bg-white" />}
      </div>
    </TerminalShell>
  );
}
