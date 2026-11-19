"use client";

import { useSyncExternalStore } from "react";

/**
 * 効果音。音声ファイルは使わず、Web Audio API でその場で合成する。
 *
 * ブラウザ(特に iPhone)は、ユーザーが画面に触れるまで音を鳴らせない。
 * 最初の操作で unlockAudio() を呼び、それまでの再生要求は黙って捨てる。
 */

export type SoundName =
  | "power" // 端末の起動
  | "key" // タイピング
  | "ok" // 起動シーケンスの「完了」など
  | "tap" // ボタン操作
  | "deny" // 権限不足・認証失敗
  | "granted" // 認証成功
  | "shutter" // 撮影
  | "complete" // 照会完了
  | "declassify" // 黒塗りの解除
  | "mail" // 新着メール
  | "alarm"; // 収容違反の警報

const STORAGE_KEY = "scp-sound";
const CHANGE_EVENT = "scp-sound-change";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let hum: { stop: () => void } | null = null;
let humWanted = false;

// ---- オン/オフの設定 ----

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // 保存できなくても、このページの間は反映する
  }
  if (!enabled) stopHumNow();
  else if (humWanted) startHum();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, isSoundEnabled, () => true);
}

// ---- 再生の準備 ----

/** ユーザー操作の中で呼ぶ。以後、音が鳴らせるようになる */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === "suspended") void context.resume();
  if (humWanted && !hum) startHum();
}

function ready(): { ctx: AudioContext; out: GainNode } | null {
  if (!context || !master || context.state !== "running" || !isSoundEnabled()) return null;
  return { ctx: context, out: master };
}

// ---- 音の部品 ----

function tone(ctx: AudioContext, out: AudioNode, opts: { type: OscillatorType; freq: number; to?: number; start?: number; dur: number; gain: number }) {
  const t = ctx.currentTime + (opts.start ?? 0);
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(opts.gain, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + opts.dur + 0.02);
}

function noise(ctx: AudioContext, out: AudioNode, opts: { start?: number; dur: number; gain: number; filter: BiquadFilterType; freq: number; to?: number }) {
  if (!noiseBuffer) return;
  const t = ctx.currentTime + (opts.start ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filter;
  filter.frequency.setValueAtTime(opts.freq, t);
  if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(opts.gain, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  src.connect(filter).connect(env).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + opts.dur + 0.02);
}

const SOUNDS: Record<SoundName, (ctx: AudioContext, out: AudioNode) => void> = {
  power: (ctx, out) => {
    tone(ctx, out, { type: "sine", freq: 45, to: 110, dur: 0.7, gain: 0.35 });
    tone(ctx, out, { type: "sine", freq: 7800, to: 9800, dur: 0.9, gain: 0.015 });
    noise(ctx, out, { dur: 0.35, gain: 0.12, filter: "lowpass", freq: 900 });
  },
  key: (ctx, out) => {
    tone(ctx, out, { type: "square", freq: 1500 + Math.random() * 900, dur: 0.012, gain: 0.035 });
  },
  ok: (ctx, out) => {
    tone(ctx, out, { type: "sine", freq: 1320, dur: 0.06, gain: 0.07 });
  },
  tap: (ctx, out) => {
    tone(ctx, out, { type: "square", freq: 880, dur: 0.018, gain: 0.04 });
  },
  deny: (ctx, out) => {
    tone(ctx, out, { type: "square", freq: 185, dur: 0.11, gain: 0.08 });
    tone(ctx, out, { type: "square", freq: 175, start: 0.15, dur: 0.16, gain: 0.08 });
  },
  granted: (ctx, out) => {
    tone(ctx, out, { type: "sine", freq: 880, dur: 0.09, gain: 0.08 });
    tone(ctx, out, { type: "sine", freq: 1320, start: 0.1, dur: 0.14, gain: 0.08 });
  },
  shutter: (ctx, out) => {
    noise(ctx, out, { dur: 0.05, gain: 0.3, filter: "highpass", freq: 2500 });
    tone(ctx, out, { type: "triangle", freq: 140, to: 60, dur: 0.07, gain: 0.25 });
    noise(ctx, out, { start: 0.09, dur: 0.04, gain: 0.18, filter: "highpass", freq: 3500 });
  },
  complete: (ctx, out) => {
    tone(ctx, out, { type: "sine", freq: 660, dur: 0.1, gain: 0.07 });
    tone(ctx, out, { type: "sine", freq: 990, start: 0.12, dur: 0.1, gain: 0.07 });
    tone(ctx, out, { type: "sine", freq: 1320, start: 0.24, dur: 0.18, gain: 0.06 });
  },
  mail: (ctx, out) => {
    tone(ctx, out, { type: "sine", freq: 1568, dur: 0.08, gain: 0.06 });
    tone(ctx, out, { type: "sine", freq: 1175, start: 0.09, dur: 0.14, gain: 0.06 });
  },
  alarm: (ctx, out) => {
    // 上下するサイレンを3回
    for (let i = 0; i < 3; i++) {
      tone(ctx, out, { type: "sawtooth", freq: 520, to: 880, start: i * 0.9, dur: 0.45, gain: 0.07 });
      tone(ctx, out, { type: "sawtooth", freq: 880, to: 520, start: i * 0.9 + 0.45, dur: 0.45, gain: 0.07 });
    }
  },
  declassify: (ctx, out) => {
    noise(ctx, out, { dur: 0.55, gain: 0.08, filter: "bandpass", freq: 4200, to: 500 });
    tone(ctx, out, { type: "sawtooth", freq: 120, to: 45, dur: 0.5, gain: 0.03 });
  },
};

export function play(name: SoundName) {
  const audio = ready();
  if (audio) SOUNDS[name](audio.ctx, audio.out);
}

// ---- 観測中の環境音(低いうなりと、かすかなノイズ) ----

export function startHum() {
  humWanted = true;
  const audio = ready();
  if (!audio || hum || !noiseBuffer) return;
  const { ctx, out } = audio;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 1.2);
  gain.connect(out);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 55;
  const oscGain = ctx.createGain();
  oscGain.gain.value = 0.6;
  osc.connect(oscGain).connect(gain);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200;
  filter.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.25;
  src.connect(filter).connect(noiseGain).connect(gain);

  osc.start();
  src.start();
  hum = {
    stop: () => {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.stop(t + 0.35);
      src.stop(t + 0.35);
    },
  };
}

function stopHumNow() {
  hum?.stop();
  hum = null;
}

export function stopHum() {
  humWanted = false;
  stopHumNow();
}
