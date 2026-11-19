"use client";

import { useEffect } from "react";

const AWAY_TITLE = "観測を継続してください";
const COPY_NOTICE = "\n\n──\n[機密情報の端末外への持ち出しは記録されます ── SCP財団 統合観測ネットワーク]";

/**
 * サイト全体の小さな仕掛け。
 * - タブを離れると、タブのタイトルが「観測を継続してください」に変わる
 * - 文章をコピーすると、末尾に持ち出しの警告が付く
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
      const selection = window.getSelection()?.toString();
      // 入力欄でのコピー(合言葉など)は邪魔しない
      const target = event.target as HTMLElement | null;
      if (!selection || !event.clipboardData || target?.closest("input, textarea")) return;
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
