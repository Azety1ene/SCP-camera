"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { useStaff } from "@/lib/client/progress.ts";
import { CLEARANCE_LABEL } from "@/lib/client/session.ts";
import { ensureProfile, updateProfile, useProfile } from "@/lib/client/store.ts";
import { detectFaces, drawRedactions, loadFaceDetector, padBox } from "@/lib/client/faces.ts";
import { play } from "@/lib/client/sound.ts";

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
    <svg viewBox={`0 0 ${x} 20`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      {bars.map((bar, i) => (
        <rect key={i} x={bar.x} y="0" width={bar.w} height="20" fill="#1b1d1c" />
      ))}
    </svg>
  );
}

/** 証明写真の撮影。顔が見つからなくても、中央を必ず[編集済み]にする */
function PhotoBooth({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    loadFaceDetector();
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
    // 中央を正方形に切り出す
    const size = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1); // 自撮りは鏡写しのほうが自然
    ctx.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, 360, 360);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 証明写真らしく、白黒に寄せる
    const image = ctx.getImageData(0, 0, 360, 360);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    }
    ctx.putImageData(image, 0, 0);

    const detector = await loadFaceDetector();
    const faces = detector ? detectFaces(detector, canvas).map((box) => padBox(box, 360, 360)) : [];
    drawRedactions(ctx, faces.length ? faces : [{ x: 80, y: 50, width: 200, height: 200 }]);
    updateProfile({ photo: canvas.toDataURL("image/jpeg", 0.75) });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-background/95 px-6">
      <p className="text-base font-bold">証明写真の撮影</p>
      <div className="relative aspect-square w-full max-w-xs overflow-hidden border border-line bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover grayscale" />
        <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-full border border-dashed border-accent/60" />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : <p className="text-xs text-muted">枠の中に顔を合わせてください。</p>}
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          やめる
        </button>
        <button
          type="button"
          onClick={shoot}
          disabled={busy || !!error}
          className="btn btn-primary"
        >
          撮影する
        </button>
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

  useEffect(() => {
    ensureProfile();
  }, []);

  if (!staff) return <p className="px-4 py-12 text-sm text-muted">職員認証を確認中 …</p>;

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
    if (!cardRef.current) return;
    const { toPng } = await import("html-to-image");
    const url = await toPng(cardRef.current, { pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = url;
    a.download = `職員証_${profile.staffNo || "未発行"}.png`;
    a.click();
  }

  return (
    <TerminalShell staff={staff}>
      {booth && <PhotoBooth onClose={() => setBooth(false)} />}
      <h1 className="text-xl font-bold">職員証</h1>
      <p className="mt-1 text-xs text-muted">職員証はサイト内で常に携行してください。紛失した場合は、ただちに人事局に届け出てください。</p>

      {/* 職員証 */}
      <div ref={cardRef} className="mx-auto mt-6 w-full max-w-sm overflow-hidden rounded-lg bg-paper font-doc text-ink shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between bg-[#1b1d1c] px-4 py-2 font-mono text-[10px] tracking-widest text-paper">
          <span>SCP FOUNDATION</span>
          <span>日本支部 職員証</span>
        </div>
        <div className="flex gap-4 p-4">
          <div className="h-28 w-24 shrink-0 overflow-hidden border border-ink/30 bg-ink/10">
            {profile.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- 端末内に保存した証明写真
              <img src={profile.photo} alt="証明写真" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center px-1 text-center font-mono text-[10px] text-ink/50">写真未登録</div>
            )}
          </div>
          <dl className="min-w-0 flex-1 space-y-1 text-[11px] leading-tight">
            <div>
              <dt className="font-mono text-[9px] text-ink/50">氏名</dt>
              <dd className="truncate text-base font-bold">{profile.name || "未登録"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] text-ink/50">職員番号</dt>
              <dd className="font-mono">{profile.staffNo || "発行中"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] text-ink/50">所属</dt>
              <dd>{staff.clearance === "O5" ? "O5評議会" : "観測記録部門"}</dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] text-ink/50">クリアランス</dt>
              <dd className={staff.clearance === "O5" ? "font-bold text-[#a3241a]" : "font-bold"}>{CLEARANCE_LABEL[staff.clearance]}</dd>
            </div>
          </dl>
        </div>
        <div className="border-t border-ink/15 px-4 pb-3 pt-2">
          <Barcode value={profile.staffNo || "81-0000-000"} />
          <div className="mt-1 flex justify-between font-mono text-[9px] text-ink/60">
            <span>発行 {issued ? issued.toLocaleDateString("ja-JP") : "—"}</span>
            <span>有効期限 {expires ? expires.toLocaleDateString("ja-JP") : "—"}</span>
          </div>
        </div>
      </div>

      {/* 登録・撮影 */}
      <form onSubmit={onSave} className="mx-auto mt-6 w-full max-w-sm space-y-2 text-sm">
        <label htmlFor="staff-name" className="block text-xs text-muted">
          氏名の登録
        </label>
        <div className="flex gap-2">
          <input
            id="staff-name"
            value={editing}
            maxLength={20}
            onChange={(event) => setName(event.target.value)}
            placeholder="氏名を入力"
            className="min-w-0 flex-1 border-b border-line bg-transparent py-2 text-foreground outline-none focus:border-accent"
          />
          <button type="submit" className="btn btn-primary">
            登録
          </button>
        </div>
      </form>
      <div className="mx-auto mt-4 grid w-full max-w-sm grid-cols-2 gap-3 text-sm">
        <button type="button" onClick={() => setBooth(true)} className="btn btn-secondary">
          証明写真を撮影
        </button>
        <button type="button" onClick={onExport} className="btn btn-secondary">
          画像で保存
        </button>
      </div>
    </TerminalShell>
  );
}
