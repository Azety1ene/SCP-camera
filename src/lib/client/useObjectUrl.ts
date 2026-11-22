"use client";

import { useEffect, useState } from "react";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Blob を <img> で表示するための URL を作り、不要になったら解放する。
 *
 * IndexedDB から取り出した Blob は、保存した直後だとスマホのブラウザで読めないことがある。
 * そのまま URL にすると画像が表示されないので、中身を一度読み出してメモリ上の Blob に写してから URL にする。
 * 読めなければ、少し待って読み直す(最大4回)。
 * 画面が隠れたあと再表示されたとき(Next.js は離れた画面を保持する)も、作り直した URL を使う。
 */
export function useObjectUrl(blob: Blob | undefined): string {
  const [state, setState] = useState<{ blob: Blob | undefined; url: string }>({ blob: undefined, url: "" });

  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    let url = "";
    (async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        try {
          const bytes = await blob.arrayBuffer();
          if (cancelled) return;
          url = URL.createObjectURL(new Blob([bytes], { type: blob.type || "image/jpeg" }));
          setState({ blob, url });
          return;
        } catch (error) {
          console.warn("[image] 画像を読み出せないので読み直します", error);
          await wait(400 * (attempt + 1));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blob]);

  return blob && state.blob === blob ? state.url : "";
}
