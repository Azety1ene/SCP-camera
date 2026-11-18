"use client";

import { useEffect, useMemo } from "react";

/** Blob を <img> で表示するための URL を作り、不要になったら解放する */
export function useObjectUrl(blob: Blob | undefined): string {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : ""), [blob]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
