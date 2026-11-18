import { Fragment, type ReactNode } from "react";
import type { Clearance } from "@/lib/client/session.ts";

/**
 * 報告書本文の記法を表示に変える。
 * - [[...]] 物語の核心。レベル2では黒塗り、O5では開示表示
 * - [注n]   脚注への参照
 * - 改行(\n) 空行で段落を分け、1つの改行は行の折り返しにする
 */

const TOKEN = /\[\[([\s\S]+?)\]\]|\[注(\d+)\]/g;

function renderInline(text: string, clearance: Clearance, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const key = `${keyPrefix}-${index++}`;
    if (match[1] !== undefined) {
      nodes.push(
        clearance === "O5" ? (
          <mark key={key} className="declassified text-inherit">
            {match[1]}
          </mark>
        ) : (
          <span key={key} className="redacted" aria-label="[編集済み]" title="閲覧にはより高いクリアランスが必要です">
            {match[1]}
          </span>
        ),
      );
    } else {
      const n = match[2];
      nodes.push(
        <sup key={key}>
          <a href={`#fn-${n}`} id={`fnref-${n}-${keyPrefix}`} className="px-0.5 text-[0.7em] underline">
            {n}
          </a>
        </sup>,
      );
    }
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function RichText({
  text,
  clearance,
  className = "",
  inline = false,
}: {
  text: string;
  clearance: Clearance;
  className?: string;
  /** 脚注やキャプションなど、段落にせず行内に置くとき */
  inline?: boolean;
}) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = (paragraph: string, p: number) =>
    paragraph.split("\n").map((line, l, all) => (
      <Fragment key={l}>
        {renderInline(line, clearance, `${p}-${l}`)}
        {l < all.length - 1 && <br />}
      </Fragment>
    ));

  if (inline) return <span className={className}>{lines(normalized, 0)}</span>;

  return (
    <>
      {normalized.split(/\n{2,}/).map((paragraph, p) => (
        <p key={p} className={className}>
          {lines(paragraph, p)}
        </p>
      ))}
    </>
  );
}
