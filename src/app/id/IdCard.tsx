"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { useStaff } from "@/lib/client/progress.ts";
import { CLEARANCE_LABEL } from "@/lib/client/session.ts";
import { ensureProfile, updateProfile, useProfile } from "@/lib/client/store.ts";
import { detectFacesInImage, drawRedactions, loadImageFaceDetector, padBox } from "@/lib/client/faces.ts";
import { play } from "@/lib/client/sound.ts";
import { exportImage } from "@/lib/client/exportImage.ts";
import { useModal } from "@/components/useModal.ts";
import { Emblem } from "@/components/Icons.tsx";

/** 職員番号から作る、それらしいバーコード(読み取れるものではない) */
function Barcode({ value }: { value: string }) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const ch of value.padEnd(14, "0")) {
    const code = ch.charCodeAt(0);
    for (let i = 0; i < 4; i++) {
      const width = ((code >> i) & 1) + 1;
      if (i % 2 === 0) bars.push({ x, w: width });
      x += width + 1;
    }
  }
  return (
    <svg viewBox={`0 0 ${x} 20`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      {bars.map((bar, i) => (
        <rect key={i} x={bar.x} y="0" width={bar.w} height="20" fill="#191917" />
      ))}
    </svg>
  );
}

/** 証明写真の撮影。顔が見つからなくても、中央を必ず[編集済み]にする */
function PhotoBooth({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useModal(dialogRef, onClose);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    loadImageFaceDetector();
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
        if (cancelled) return;
        videoRef.current!.srcObject = stream;
        await videoRef.current!.play();
      } catch {
        if (!cancelled) setError("カメラに接続できません。ブラウザの設定でカメラを許可してください。");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    setBusy(true);
    play("shutter");
    const size = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, 360, 360);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const image = ctx.getImageData(0, 0, 360, 360);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    }
    ctx.putImageData(image, 0, 0);

    const faces = ((await detectFacesInImage(canvas)) ?? []).map((box) => padBox(box, 360, 360));
    drawRedactions(ctx, faces.length ? faces : [{ x: 80, y: 50, width: 200, height: 200 }]);
    updateProfile({ photo: canvas.toDataURL("image/jpeg", 0.75) });
    onClose();
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-booth-title"
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/85 px-4"
    >
      <div className="w-full max-w-sm border-2 border-line-strong bg-panel">
        <div className="flex items-center justify-between border-b border-line bg-sunken px-4 py-2 font-mono text-xs">
          <span id="photo-booth-title" className="font-bold text-foreground">
            証明写真 撮影装置
          </span>
          <span className="text-muted">自動編集: 有効</span>
        </div>
        <div className="p-4">
          <div className="relative aspect-square w-full overflow-hidden border border-line-strong bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover grayscale" />
            <div aria-hidden className="pointer-events-none absolute inset-[16%] border border-dashed border-foreground/50" />
          </div>
          {error ? (
            <p className="mt-3 text-xs text-danger">{error}</p>
          ) : (
            <p className="mt-3 text-xs text-muted">枠内に顔を合わせて撮影してください。顔領域は規定により自動編集されます。</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              中止
            </button>
            <button type="button" onClick={shoot} disabled={busy || !!error} className="btn btn-primary">
              {busy ? "処理中 …" : "撮影する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IdCard() {
  const staff = useStaff();
  const profile = useProfile();
  const [name, setName] = useState<string | null>(null);
  const [booth, setBooth] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [exportState, setExportState] = useState<"idle" | "busy" | "shared" | "downloaded" | "error">("idle");

  useEffect(() => {
    ensureProfile();
  }, []);

  if (!staff) return <p className="px-4 py-12 font-mono text-xs text-muted">職員認証を確認中 …</p>;

  const issued = profile.joinedAt ? new Date(profile.joinedAt) : null;
  const expires = issued ? new Date(issued.getFullYear() + 1, issued.getMonth(), issued.getDate()) : null;
  const editing = name ?? profile.name;

  function onSave(event: FormEvent) {
    event.preventDefault();
    updateProfile({ name: (name ?? "").trim().slice(0, 20) });
    setName(null);
    play("granted");
  }

  async function onExport() {
    if (!cardRef.current || exportState === "busy") return;
    setExportState("busy");
    try {
      const result = await exportImage(cardRef.current, `職員証_${profile.staffNo || "未発行"}.png`);
      setExportState(result === "cancelled" ? "idle" : result);
      if (result !== "cancelled") play("ok");
    } catch {
      setExportState("error");
      play("deny");
    }
  }

  return (
    <TerminalShell staff={staff} screen={{ id: "PER-0600", name: "職員証" }}>
      {booth && <PhotoBooth onClose={() => setBooth(false)} />}

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h1 className="font-doc text-lg font-bold tracking-wide">職員証</h1>
        <span className="font-mono text-[11px] text-muted">{profile.staffNo || "発行中"}</span>
      </div>
      <p className="mt-3 text-xs text-muted">
        職員証はサイト内で常に携行してください。紛失した場合は、ただちに人事局へ届け出てください。
      </p>

      {/* 入館・職員証カード */}
      <div
        ref={cardRef}
        className="mx-auto mt-6 w-full max-w-sm border border-[#7c7769] bg-paper font-doc text-ink shadow-[4px_4px_0_rgba(0,0,0,0.45)]"
      >
        {/* ストラップ通し穴風のスリット帯 */}
        <div className="flex items-center justify-center bg-[#191917] pt-2 pb-1">
          <span aria-hidden className="h-1.5 w-14 rounded-full border border-paper/25 bg-[#0a0a09]" />
        </div>
        <div className="flex items-center justify-between border-b-2 border-[#b53429] bg-[#191917] px-4 py-2 font-mono text-[10px] tracking-wider text-paper">
          <span className="flex items-center gap-1.5">
            <Emblem className="h-4 w-4 text-paper" />
            <span>SCP FOUNDATION</span>
          </span>
          <span>日本支部 職員証</span>
        </div>

        <div className="flex gap-4 p-4">
          <div className="flex w-24 shrink-0 flex-col">
            <div className="h-28 w-24 overflow-hidden border border-ink/50 bg-ink/10">
              {profile.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- 端末内に保存した証明写真
                <img src={profile.photo} alt="証明写真" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-1 text-center font-mono text-[10px] text-ink/70">
                  写真未登録
                </div>
              )}
            </div>
            <span className="mt-1 text-center font-mono text-[8px] text-ink/65">ID PHOTO</span>
          </div>

          <dl className="min-w-0 flex-1 divide-y divide-ink/15 text-[11px] leading-tight">
            <div className="pb-1.5">
              <dt className="font-mono text-[9px] text-ink/70">氏名</dt>
              <dd className="mt-0.5 truncate text-base font-bold">{profile.name || "未登録"}</dd>
            </div>
            <div className="py-1.5">
              <dt className="font-mono text-[9px] text-ink/70">職員番号</dt>
              <dd className="mt-0.5 font-mono">{profile.staffNo || "発行中"}</dd>
            </div>
            <div className="py-1.5">
              <dt className="font-mono text-[9px] text-ink/70">所属</dt>
              <dd className="mt-0.5">{staff.clearance === "O5" ? "O5評議会" : "サイト-81██ 観測記録部門"}</dd>
            </div>
            <div className="pt-1.5">
              <dt className="font-mono text-[9px] text-ink/70">クリアランス</dt>
              <dd className={`mt-0.5 font-mono font-bold ${staff.clearance === "O5" ? "text-[#9e261d]" : "text-ink"}`}>
                {CLEARANCE_LABEL[staff.clearance]}
              </dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-ink/25 bg-paper-edge/40 px-4 pb-3 pt-2">
          <Barcode value={profile.staffNo || "81-0000-000"} />
          <div className="mt-1 flex justify-between font-mono text-[9px] text-ink/75">
            <span>発行 {issued ? issued.toLocaleDateString("ja-JP") : "—"}</span>
            <span>有効期限 {expires ? expires.toLocaleDateString("ja-JP") : "—"}</span>
          </div>
        </div>
      </div>

      {/* 登録・書き出し手続き */}
      <section className="ledger mx-auto mt-6 w-full max-w-sm">
        <div className="ledger-title">
          <h2>登録情報の変更・出力</h2>
        </div>
        <div className="bg-sunken p-4">
          <form onSubmit={onSave} className="space-y-2 text-sm">
            <label htmlFor="staff-name" className="block font-mono text-[11px] text-muted">
              氏名(20文字まで)
            </label>
            <div className="flex gap-2">
              <input
                id="staff-name"
                value={editing}
                maxLength={20}
                onChange={(event) => setName(event.target.value)}
                placeholder="氏名を入力"
                className="field-input flex-1 font-ui"
              />
              <button type="submit" className="btn btn-primary shrink-0">
                登録
              </button>
            </div>
          </form>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <button type="button" onClick={() => setBooth(true)} className="btn btn-secondary">
              証明写真を撮影
            </button>
            <button type="button" onClick={onExport} disabled={exportState === "busy"} className="btn btn-secondary">
              {exportState === "busy" ? "書き出し中 …" : "画像で保存"}
            </button>
          </div>
          <p role="status" aria-live="polite" className="mt-3 min-h-5 text-xs">
            {exportState === "downloaded" && <span className="text-accent">職員証の画像を書き出しました(ダウンロードフォルダに保存されます)。</span>}
            {exportState === "shared" && <span className="text-accent">職員証の画像を書き出しました。</span>}
            {exportState === "error" && <span className="text-danger">画像を作成できませんでした。もう一度お試しください。</span>}
          </p>
        </div>
      </section>
    </TerminalShell>
  );
}
