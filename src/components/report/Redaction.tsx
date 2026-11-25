"use client";

import { useEffect, useState, type ReactNode } from "react";
import { play } from "@/lib/client/sound.ts";
import { stableFraction } from "@/lib/report/redaction.ts";
import { CLEARANCE_LABEL, type Clearance } from "@/lib/client/session.ts";

/**
 * クリアランスが足りない黒塗り。タップすると震えて「閲覧権限がありません」と出る。
 * children には伏せ字(█)を渡す。未開示の中身は DOM に出さない
 */
export function Redacted({ children, required }: { children: ReactNode; required: Clearance }) {
  const [denied, setDenied] = useState(0);

  useEffect(() => {
    if (!denied) return;
    const timer = setTimeout(() => setDenied(0), 1600);
    return () => clearTimeout(timer);
  }, [denied]);

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="[編集済み] 閲覧にはより高いクリアランスが必要です"
      onClick={() => {
        play("deny");
        setDenied((n) => n + 1);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          play("deny");
          setDenied((n) => n + 1);
        }
      }}
      className="relative inline cursor-not-allowed"
    >
      {/* key を変えて、連続でタップしても毎回震えるようにする */}
      <span key={denied} className={`redacted ${denied ? "redact-denied" : ""}`}>
        {children}
      </span>
      {/* 黒塗りの位置に関係なく画面からはみ出さないよう、画面下に固定して出す */}
      {denied > 0 && (
        <span
          key={`notice-${denied}`}
          role="status"
          className="pointer-events-none fixed inset-x-4 bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4rem))] z-50 mx-auto block max-w-sm border-2 border-seal bg-[#1b0c0b] px-4 py-2.5 text-center font-mono text-[12px] leading-6 not-italic text-[#f0c7c2] shadow-[3px_3px_0_rgba(0,0,0,0.65)]"
        >
          <span className="block font-bold tracking-widest text-seal-text">閲覧拒否 // ACCESS DENIED</span>
          閲覧権限がありません ── 要求クリアランス: {CLEARANCE_LABEL[required]}
        </span>
      )}
    </span>
  );
}

/** クリアランスが足りて開示された核心。開いた直後は黒塗りで、少しずつ剥がれて中身が現れる */
export function Declassified({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  const delay = 0.6 + stableFraction(text) * 1.6;

  return (
    <mark
      className={`declassified text-inherit ${revealed ? "" : "declassify-reveal"}`}
      style={revealed ? undefined : { animationDelay: `${delay.toFixed(2)}s` }}
      // 剥がし終えたら演出用の指定を外す(画像の書き出しで黒塗りが残らないように)
      onAnimationEnd={() => setRevealed(true)}
    >
      {text}
    </mark>
  );
}
