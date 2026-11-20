"use client";

import { useEffect } from "react";
import { play, setSoundEnabled, unlockAudio, useSoundEnabled } from "@/lib/client/sound.ts";
import { SpeakerIcon } from "@/components/Icons.tsx";

/**
 * 効果音のオン/オフ。今どちらの状態かが一目で分かるよう、
 * アイコン(スピーカー / ×付きのスピーカー)と「ON / OFF」の文字と色の3つで示す。
 */
export function SoundToggle({ className = "" }: { className?: string }) {
  const enabled = useSoundEnabled();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "効果音: オン(押すとオフ)" : "効果音: オフ(押すとオン)"}
      onClick={() => {
        unlockAudio();
        setSoundEnabled(!enabled);
        if (!enabled) play("tap");
      }}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 font-mono text-[11px] font-bold tracking-wider transition-colors ${
        enabled ? "border-accent/70 bg-accent/15 text-accent" : "border-line bg-raised text-muted"
      } ${className}`}
    >
      <SpeakerIcon muted={!enabled} className="h-4 w-4" />
      {enabled ? "ON" : "OFF"}
    </button>
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
