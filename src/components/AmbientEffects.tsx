"use client";

import { useEffect } from "react";

const AWAY_TITLE = "観測を継続してください";
const COPY_NOTICE = "\n\n──\n[機密情報の端末外への持ち出しは記録されます ── SCP財団 統合観測ネットワーク]";

/**
 * サイト全体の小さな仕掛け。
 * - タブを離れると、タブのタイトルが「観測を継続してください」に変わる
 * - 報告書や書庫の文書など、機密文書の本文(data-classified を付けた要素の中)をコピーすると、末尾に持ち出しの警告が付く。
 *   エラーコードやアイテム番号など、それ以外の場所のコピーは邪魔しない
 */
export function AmbientEffects() {
  useEffect(() => {
    let savedTitle = document.title;
    const onVisibility = () => {
      if (document.hidden) {
        savedTitle = document.title;
        document.title = AWAY_TITLE;
      } else if (document.title === AWAY_TITLE) {
        document.title = savedTitle;
      }
    };

    const onCopy = (event: ClipboardEvent) => {
      const selected = window.getSelection();
      const selection = selected?.toString();
      if (!selected || !selection || !event.clipboardData || selected.rangeCount === 0) return;
      // 選んだ範囲が機密文書の本文に掛かっているときだけ
      const range = selected.getRangeAt(0);
      const inClassified = [...document.querySelectorAll("[data-classified]")].some((el) => range.intersectsNode(el));
      if (!inClassified) return;
      event.clipboardData.setData("text/plain", selection + COPY_NOTICE);
      event.preventDefault();
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("copy", onCopy);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("copy", onCopy);
    };
  }, []);

  return null;
}
