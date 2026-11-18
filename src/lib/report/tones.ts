import { ADDENDUM_FORMATS } from "./schema.ts";

/**
 * 読後感の型。docs/research/00-summary.md の「4. 読後感の型」をもとにしている。
 * weight は選ばれやすさ。笑いに寄る型が全体の半分を超えないようにしている。
 */
export type Tone = {
  id: string;
  name: string;
  /** プロンプトに渡す、この型の作り方 */
  guide: string;
  weight: number;
};

export const TONES: Tone[] = [
  {
    id: "healing",
    name: "ほっこり・癒し",
    guide:
      "記述は短めにする。異常は淡々と書き、害がないことを添える。収容プロトコルに世話の細かい指示(好物、扱い方の癖)を入れて愛着を作る。原因には触れない。",
    weight: 1,
  },
  {
    id: "laugh-to-sad",
    name: "笑いから切なさへ",
    guide:
      "前半は官僚的なルールと日常物のギャップ、淡々とした注記で笑わせる。最後の補遺か脚注で、持ち主や職員の私的な一言を置き、静かな切なさに転調する。",
    weight: 2,
  },
  {
    id: "bittersweet",
    name: "切なさ・温かさ",
    guide:
      "冷たい実験記録や医療報告の文体で、対象の善意や献身を記録する。感情は地の文に書かず、証言・手紙・手記に任せる。最後に私的な品(手紙、メモ、カード)で締める。",
    weight: 2,
  },
  {
    id: "creeping",
    name: "じわじわ来る不安",
    guide:
      "時間経過で段階的に異常が進む構成にする(例: 24時間後、48時間後、72時間後)。数値や記録の欠落を異常の一部にする。明確な被害は書かず、説明しきれない怖さを残す。",
    weight: 2,
  },
  {
    id: "horror",
    name: "ホラー",
    guide:
      "愛らしさや生活感を先に積み上げてから裏切る。最悪の結果だけを [[...]] で伏せ、その一段手前は具体的に書く。過度なゴアは避け、想像させる。",
    weight: 1,
  },
  {
    id: "rule",
    name: "ルール型の緊張",
    guide:
      "恐怖の源を『破ってはならない手順』として収容プロトコルに埋め込む。仕組みは説明しない。異常な状態を『これは正常である』と注記して平常として扱う。",
    weight: 1,
  },
  {
    id: "mystery",
    name: "謎",
    guide:
      "仕組みや起源を『未解明』のまま残す。記録同士に小さな矛盾を置き、最後まで説明しない。結論は断定せず、仮説として並べる。",
    weight: 2,
  },
  {
    id: "scale",
    name: "スケールの飛躍",
    guide:
      "管理手順 → 対象の内部 → 周囲への影響 → 世界規模の影響、と段階的に規模を広げる。影響が遅れてやってくる(何年も後に起きる)ことで取り返しのつかなさを出す。",
    weight: 1,
  },
  {
    id: "twist",
    name: "どんでん返し",
    guide:
      "前半で表向きの説明をし、O5補遺で『前の記述は誤り(または偽情報)だった』と明かす。題名や評価が反転するような真相にする。",
    weight: 2,
  },
  {
    id: "meta",
    name: "読者を巻き込む",
    guide:
      "報告書を読む行為そのものを異常に関わらせる。冒頭の閲覧警告、本文への小さな割り込み、『この報告書を読んだ時点で』という示唆などを使う。最後の一文を読者への呼びかけにしてもよい。",
    weight: 1,
  },
];

function pickWeighted<T extends { weight: number }>(items: T[], random: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

function pickDistinct<T>(items: readonly T[], count: number, random: () => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return picked;
}

export type StoryPlan = {
  tone: Tone;
  /** 補遺の形式の候補。モデルはこの中から1〜2個を選ぶ */
  formatHints: string[];
};

export function planStory(random: () => number = Math.random): StoryPlan {
  return {
    tone: pickWeighted(TONES, random),
    formatHints: pickDistinct(ADDENDUM_FORMATS, 3, random),
  };
}
