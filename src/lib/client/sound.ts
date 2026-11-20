"use client";

import { useSyncExternalStore } from "react";

/**
 * 効果音。音声ファイルは使わず、Web Audio API でその場で合成する。
 *
 * 電子音の「ピッ」に聞こえないよう、実物の鳴り方に寄せて作っている。
 * - 機械の音(打鍵・シャッター・リレー・印字)は、ごく短いノイズを共鳴させて作る
 * - 出力は、小さな部屋の残響・軽いコンプレッサー・高域を少し落とすフィルターを通す
 * - 毎回わずかに高さや強さを揺らし、同じ音の繰り返しに聞こえないようにする
 *
 * ブラウザ(特に iPhone)は、ユーザーが画面に触れるまで音を鳴らせない。
 * 最初の操作で unlockAudio() を呼び、それまでの再生要求は黙って捨てる。
 */

export type SoundName =
  | "power" // 端末の起動(ブラウン管の通電)
  | "key" // キーボードの打鍵
  | "ok" // 起動シーケンスの「完了」(リレーの作動音)
  | "tap" // ボタン操作
  | "deny" // 権限不足・認証失敗(ブザー)
  | "granted" // 認証成功
  | "shutter" // 撮影(機械式シャッター)
  | "complete" // 照会完了(印字)
  | "declassify" // 黒塗りの解除(紙を剥がす音)
  | "mail" // 新着メール
  | "alarm"; // 収容違反の警報

const STORAGE_KEY = "scp-sound";
const CHANGE_EVENT = "scp-sound-change";

type Engine = {
  ctx: AudioContext;
  /** 乾いた音の出口(残響なし) */
  dry: GainNode;
  /** 残響に送る出口 */
  wet: GainNode;
  white: AudioBuffer;
  brown: AudioBuffer;
};

let engine: Engine | null = null;
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

function makeNoise(ctx: AudioContext, kind: "white" | "brown", seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === "white") data[i] = white;
    else {
      // ブラウンノイズ: 低い成分が多い、部屋の空気や機械のうなりに近いノイズ
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

/** 小さなコンクリートの部屋の響き(減衰するノイズを、残響の型として使う) */
function makeRoom(ctx: AudioContext): AudioBuffer {
  const seconds = 0.9;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // 最初の反射を少し強めにして、狭い部屋らしくする
      const early = i < ctx.sampleRate * 0.03 ? 1.6 : 1;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * early;
    }
  }
  return buffer;
}

/** ユーザー操作の中で呼ぶ。以後、音が鳴らせるようになる */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!engine) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();

    // 出力: 高域を少し落とす → 軽いコンプレッサー → 音量
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 9000;
    tone.connect(compressor).connect(master).connect(ctx.destination);

    const dry = ctx.createGain();
    dry.connect(tone);
    const wet = ctx.createGain();
    const room = ctx.createConvolver();
    room.buffer = makeRoom(ctx);
    const roomLevel = ctx.createGain();
    roomLevel.gain.value = 0.22;
    wet.connect(room).connect(roomLevel).connect(tone);

    engine = { ctx, dry, wet, white: makeNoise(ctx, "white", 2), brown: makeNoise(ctx, "brown", 4) };
  }
  if (engine.ctx.state === "suspended") void engine.ctx.resume();
  if (humWanted && !hum) startHum();
}

function ready(): Engine | null {
  if (!engine || engine.ctx.state !== "running" || !isSoundEnabled()) return null;
  return engine;
}

// ---- 音の部品 ----

const vary = (value: number, amount: number) => value * (1 + (Math.random() * 2 - 1) * amount);

/** 出口へつなぐ。wet は残響へ送る量(0〜1) */
function route(e: Engine, node: AudioNode, wet = 0.4) {
  node.connect(e.dry);
  if (wet > 0) {
    const send = e.ctx.createGain();
    send.gain.value = wet;
    node.connect(send).connect(e.wet);
  }
}

function envelope(e: Engine, start: number, peak: number, attack: number, decay: number): GainNode {
  const gain = e.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  return gain;
}

/** フィルターを通したノイズの一発。機械の「カチッ」「ザッ」の素 */
function burst(
  e: Engine,
  opts: { at?: number; gain: number; attack?: number; decay: number; type: BiquadFilterType; freq: number; q?: number; to?: number; wet?: number; brown?: boolean },
) {
  const t = e.ctx.currentTime + (opts.at ?? 0);
  const src = e.ctx.createBufferSource();
  src.buffer = opts.brown ? e.brown : e.white;
  const filter = e.ctx.createBiquadFilter();
  filter.type = opts.type;
  filter.frequency.setValueAtTime(opts.freq, t);
  if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.attack ?? 0.001) + opts.decay);
  filter.Q.value = opts.q ?? 1;
  const env = envelope(e, t, opts.gain, opts.attack ?? 0.001, opts.decay);
  src.connect(filter).connect(env);
  route(e, env, opts.wet ?? 0.35);
  src.start(t, Math.random() * 1.5);
  src.stop(t + (opts.attack ?? 0.001) + opts.decay + 0.05);
}

/** 減衰する音程のある音。type や倍音の組み合わせで、ベルや筐体の鳴りを作る */
function ring(
  e: Engine,
  opts: { at?: number; freq: number; to?: number; gain: number; attack?: number; decay: number; type?: OscillatorType; wet?: number; lowpass?: number },
) {
  const t = e.ctx.currentTime + (opts.at ?? 0);
  const osc = e.ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.attack ?? 0.002) + opts.decay);
  const env = envelope(e, t, opts.gain, opts.attack ?? 0.002, opts.decay);
  let head: AudioNode = osc;
  if (opts.lowpass) {
    const filter = e.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = opts.lowpass;
    osc.connect(filter);
    head = filter;
  }
  head.connect(env);
  route(e, env, opts.wet ?? 0.4);
  osc.start(t);
  osc.stop(t + (opts.attack ?? 0.002) + opts.decay + 0.05);
}

/** 金属のベル。基音に、ずれた倍音を重ねる(電子音のチャイムより本物に近い) */
function bell(e: Engine, at: number, freq: number, gain: number) {
  const partials = [
    [1, 1, 1.2],
    [2.76, 0.45, 0.6],
    [5.4, 0.22, 0.35],
    [8.93, 0.1, 0.2],
  ];
  for (const [ratio, level, decay] of partials) ring(e, { at, freq: freq * ratio, gain: gain * level, decay, wet: 0.6 });
}

/** 波形をひずませる(ブザーや警報の、古いスピーカーらしいざらつき) */
function distortion(ctx: AudioContext, amount: number): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / curve.length) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  shaper.curve = curve;
  return shaper;
}

/** 古いスピーカーから鳴る、ひずんだ持続音 */
function horn(e: Engine, opts: { at: number; freqs: number[]; dur: number; gain: number; band: number }) {
  const t = e.ctx.currentTime + opts.at;
  const mix = e.ctx.createGain();
  mix.gain.value = 1 / opts.freqs.length;
  const oscs = opts.freqs.map((freq) => {
    const osc = e.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.connect(mix);
    return osc;
  });
  const shaper = distortion(e.ctx, 6);
  const band = e.ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = opts.band;
  band.Q.value = 1.4;
  const env = e.ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(opts.gain, t + 0.015);
  env.gain.setValueAtTime(opts.gain, t + opts.dur - 0.03);
  env.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  mix.connect(shaper).connect(band).connect(env);
  route(e, env, 0.7);
  for (const osc of oscs) {
    osc.start(t);
    osc.stop(t + opts.dur + 0.05);
  }
}

// ---- 各効果音 ----

const SOUNDS: Record<SoundName, (e: Engine) => void> = {
  // ブラウン管の通電: 「ボン」という低い衝撃、消磁のうなり、立ち上がる高音、静電気のパチパチ
  power: (e) => {
    ring(e, { freq: 70, to: 38, gain: 0.55, decay: 0.45, wet: 0.5 });
    burst(e, { gain: 0.35, decay: 0.18, type: "lowpass", freq: 400, brown: true, wet: 0.5 });
    // 消磁コイルのうなり(交流の周波数の倍音が、揺れながら消えていく)
    const t = e.ctx.currentTime + 0.05;
    const buzz = e.ctx.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.value = 100;
    const buzzFilter = e.ctx.createBiquadFilter();
    buzzFilter.type = "lowpass";
    buzzFilter.frequency.value = 700;
    const wobble = e.ctx.createOscillator();
    wobble.frequency.value = 9;
    const wobbleDepth = e.ctx.createGain();
    wobbleDepth.gain.value = 0.04;
    const buzzEnv = envelope(e, t, 0.09, 0.02, 0.9);
    wobble.connect(wobbleDepth).connect(buzzEnv.gain);
    buzz.connect(buzzFilter).connect(buzzEnv);
    route(e, buzzEnv, 0.3);
    buzz.start(t);
    wobble.start(t);
    buzz.stop(t + 1.0);
    wobble.stop(t + 1.0);
    ring(e, { at: 0.1, freq: 14500, to: 15700, gain: 0.012, attack: 0.3, decay: 1.2, wet: 0 });
    for (let i = 0; i < 7; i++) {
      burst(e, { at: 0.15 + Math.random() * 0.7, gain: vary(0.05, 0.5), decay: 0.004, type: "highpass", freq: 3000, wet: 0.2 });
    }
  },

  // メカニカルキーボード: 接点の「カチ」と、底打ちの「コト」
  key: (e) => {
    burst(e, { gain: vary(0.09, 0.3), decay: 0.006, type: "bandpass", freq: vary(4200, 0.15), q: 3, wet: 0.15 });
    burst(e, { at: 0.008, gain: vary(0.12, 0.3), decay: 0.03, type: "lowpass", freq: vary(900, 0.2), brown: true, wet: 0.25 });
    ring(e, { at: 0.008, freq: vary(170, 0.12), gain: vary(0.05, 0.3), decay: 0.035, type: "triangle", wet: 0.1 });
  },

  // リレーが2回切り替わる音
  ok: (e) => {
    burst(e, { gain: 0.12, decay: 0.008, type: "bandpass", freq: 2600, q: 4, wet: 0.3 });
    burst(e, { at: 0.035, gain: 0.08, decay: 0.01, type: "bandpass", freq: 1900, q: 4, wet: 0.3 });
  },

  // 物理ボタンを押した感触
  tap: (e) => {
    burst(e, { gain: 0.06, decay: 0.006, type: "bandpass", freq: vary(3200, 0.1), q: 2, wet: 0.2 });
    burst(e, { at: 0.004, gain: 0.05, decay: 0.02, type: "lowpass", freq: 700, brown: true, wet: 0.1 });
  },

  // 入退室ゲートの拒否ブザー: ひずんだ低い音が2回
  deny: (e) => {
    horn(e, { at: 0, freqs: [196, 207.6], dur: 0.16, gain: 0.16, band: 900 });
    horn(e, { at: 0.22, freqs: [196, 207.6], dur: 0.24, gain: 0.16, band: 900 });
  },

  // ゲートの解錠: 電磁錠が外れる「ガチャッ」と、短い確認音
  granted: (e) => {
    burst(e, { gain: 0.22, decay: 0.05, type: "lowpass", freq: 1200, brown: true, wet: 0.4 });
    burst(e, { gain: 0.1, decay: 0.012, type: "bandpass", freq: 2200, q: 3, wet: 0.3 });
    bell(e, 0.12, 1046, 0.05);
  },

  // 機械式シャッター: ミラーが跳ね上がる音と、幕が走る音
  shutter: (e) => {
    burst(e, { gain: 0.3, decay: 0.018, type: "bandpass", freq: 1800, q: 1.5, wet: 0.25 });
    ring(e, { freq: 320, to: 180, gain: 0.12, decay: 0.05, type: "triangle", wet: 0.2 });
    burst(e, { at: 0.03, gain: 0.12, decay: 0.03, type: "highpass", freq: 4000, wet: 0.2 });
    burst(e, { at: 0.075, gain: 0.26, decay: 0.022, type: "bandpass", freq: 1500, q: 1.5, wet: 0.25 });
    ring(e, { at: 0.075, freq: 260, to: 150, gain: 0.08, decay: 0.05, type: "triangle", wet: 0.2 });
  },

  // ドットインパクトプリンターが一行だけ印字する音
  complete: (e) => {
    for (let i = 0; i < 14; i++) {
      burst(e, { at: i * 0.028 + Math.random() * 0.006, gain: vary(0.07, 0.3), decay: 0.012, type: "bandpass", freq: vary(2400, 0.1), q: 2.5, wet: 0.3 });
    }
    burst(e, { at: 0.42, gain: 0.1, decay: 0.09, type: "bandpass", freq: 600, to: 300, brown: true, wet: 0.3 });
  },

  // 黒塗りのテープを剥がす音
  declassify: (e) => {
    for (let i = 0; i < 18; i++) {
      burst(e, { at: i * 0.028, gain: vary(0.05, 0.6), decay: 0.02, type: "highpass", freq: 900 + i * 120, wet: 0.2 });
    }
    burst(e, { gain: 0.06, attack: 0.05, decay: 0.45, type: "bandpass", freq: 1200, to: 3800, q: 0.8, wet: 0.3 });
  },

  // 新着メール: 小さなベルが2つ
  mail: (e) => {
    bell(e, 0, 1318, 0.06);
    bell(e, 0.16, 988, 0.06);
  },

  // 収容違反の警報: ひずんだ警報音が、間をあけて4回
  alarm: (e) => {
    for (let i = 0; i < 4; i++) horn(e, { at: i * 0.95, freqs: [440, 466, 554], dur: 0.6, gain: 0.2, band: 1100 });
  },
};

export function play(name: SoundName) {
  const e = ready();
  if (e) SOUNDS[name](e);
}

// ---- 観測中の環境音(空調と機械のうなり、電源の低い唸り) ----

export function startHum() {
  humWanted = true;
  const e = ready();
  if (!e || hum) return;
  const { ctx } = e;
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.0001, ctx.currentTime);
  level.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 1.5);
  route(e, level, 0.2);

  // 空調の風: 低い成分の多いノイズ
  const air = ctx.createBufferSource();
  air.buffer = e.brown;
  air.loop = true;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "lowpass";
  airFilter.frequency.value = 380;
  air.connect(airFilter).connect(level);

  // 電源の唸り(基音とその倍音を、ごく小さく)
  const mains = [50, 100, 150].map((freq, i) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = [0.06, 0.035, 0.015][i];
    osc.connect(gain).connect(level);
    return osc;
  });

  air.start();
  mains.forEach((osc) => osc.start());

  // ときどき、機器のかすかなノイズが入る
  const crackle = window.setInterval(() => {
    if (Math.random() < 0.35) burst(e, { gain: 0.02, decay: 0.006, type: "highpass", freq: 2500, wet: 0.3 });
  }, 1400);

  hum = {
    stop: () => {
      const t = ctx.currentTime;
      level.gain.cancelScheduledValues(t);
      level.gain.setValueAtTime(level.gain.value, t);
      level.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      air.stop(t + 0.45);
      mains.forEach((osc) => osc.stop(t + 0.45));
      clearInterval(crackle);
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
