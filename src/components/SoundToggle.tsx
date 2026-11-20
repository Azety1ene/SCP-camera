"use client";

import { useEffect } from "react";
import { play, setSoundEnabled, unlockAudio, useSoundEnabled } from "@/lib/client/sound.ts";
import { SpeakerIcon } from "@/components/Icons.tsx";

/**
 * 効果音の入/切。機器のスイッチのように「入」「切」の2つを並べ、今の位置を白黒反転で示す。
 * どちらを押しても、その状態に切り替わる。
 */
export function SoundToggle({ className = "" }: { className?: string }) {
  const enabled = useSoundEnabled();
  const set = (next: boolean) => {
    unlockAudio();
    if (next === enabled) return;
    setSoundEnabled(next);
    if (next) play("tap");
  };
  const segment = (active: boolean) =>
    `flex h-full min-w-9 items-center justify-center px-2 ${active ? "bg-foreground text-[#111416]" : "text-muted hover:text-foreground"}`;
  return (
    <div role="group" aria-label="効果音" className={`flex h-9 items-center gap-1.5 text-[11px] ${className}`}>
      <SpeakerIcon muted={!enabled} className={`h-4 w-4 ${enabled ? "text-foreground" : "text-muted"}`} />
      <span className="flex h-8 items-stretch border border-[#48535a] font-bold">
        <button type="button" aria-pressed={enabled} onClick={() => set(true)} className={segment(enabled)}>
          入
        </button>
        <button type="button" aria-pressed={!enabled} onClick={() => set(false)} className={`${segment(!enabled)} border-l border-[#48535a]`}>
          切
        </button>
      </span>
    </div>
  );
}

/** どの画面から開いても、最初に画面へ触れた時点で音を鳴らせるようにする */
export function AudioUnlocker() {
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  return null;
}
