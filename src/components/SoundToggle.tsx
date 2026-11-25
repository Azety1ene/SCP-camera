"use client";

import { useEffect } from "react";
import { play, setSoundEnabled, unlockAudio, useSoundEnabled } from "@/lib/client/sound.ts";
import { SpeakerIcon } from "@/components/Icons.tsx";

/**
 * 効果音の入/切。機器のトグルスイッチのように「入」「切」の2つを並べ、現在の位置を反転で示す。
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
    `flex h-full min-w-8 items-center justify-center px-1.5 font-mono text-[11px] font-bold transition-colors ${
      active ? "bg-foreground text-background" : "bg-sunken text-muted hover:text-foreground"
    }`;
  return (
    <div role="group" aria-label="効果音" className={`flex h-8 items-center gap-1.5 text-[11px] ${className}`}>
      <SpeakerIcon muted={!enabled} className={`h-3.5 w-3.5 shrink-0 ${enabled ? "text-foreground" : "text-muted"}`} />
      <span className="flex h-7 items-stretch border border-line-strong">
        <button type="button" aria-pressed={enabled} onClick={() => set(true)} className={segment(enabled)}>
          入
        </button>
        <button type="button" aria-pressed={!enabled} onClick={() => set(false)} className={`${segment(!enabled)} border-l border-line-strong`}>
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
