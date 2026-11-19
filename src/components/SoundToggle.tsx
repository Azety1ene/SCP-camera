"use client";

import { useEffect } from "react";
import { play, setSoundEnabled, unlockAudio, useSoundEnabled } from "@/lib/client/sound.ts";

/** 効果音のオン/オフ */
export function SoundToggle({ className = "" }: { className?: string }) {
  const enabled = useSoundEnabled();
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={() => {
        unlockAudio();
        setSoundEnabled(!enabled);
        if (!enabled) play("tap");
      }}
      className={`hover:text-foreground ${className}`}
    >
      音 {enabled ? "入" : "切"}
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
