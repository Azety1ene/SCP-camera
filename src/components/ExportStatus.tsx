import type { ExportResult } from "@/lib/client/exportImage.ts";

export type ExportState = "idle" | "busy" | ExportResult | "error";

/** 画像の書き出しの結果。読み上げにも伝わるよう role="status" で出す */
export function ExportStatus({ state, subject }: { state: ExportState; subject: string }) {
  return (
    <p role="status" aria-live="polite" className="mt-3 min-h-5 text-xs">
      {state === "downloaded" && <span className="text-accent">{subject}の画像を書き出しました(ダウンロードフォルダに保存されます)。</span>}
      {state === "shared" && <span className="text-accent">{subject}の画像を書き出しました。</span>}
      {state === "error" && <span className="text-danger">画像を作成できませんでした。もう一度お試しください。</span>}
    </p>
  );
}

/** 書き出しの結果を状態に変える。共有を取り消したときは何も出さない */
export function exportOutcome(result: ExportResult): ExportState {
  return result === "cancelled" ? "idle" : result;
}
