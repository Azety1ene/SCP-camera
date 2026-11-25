import { Fragment, type ReactNode } from "react";
import { hasClearance, type Clearance } from "@/lib/client/session.ts";
import { fallbackLevel, maskText, parseRedaction } from "@/lib/report/redaction.ts";
import { Declassified, Redacted } from "./Redaction.tsx";

/**
 * 報告書本文の記法を表示に変える。
 * - [[L3:...]] 物語の核心。必要なクリアランス(L3 / L4 / O5)が足りなければ黒塗り(redaction.ts)。
 *   足りないときは中身を DOM に出さず、伏せ字(█)に置き換える(ページ内検索やテキストの抜き出しで読めないように)
 * - [注n]   脚注への参照
 * - 改行(\n) 空行で段落を分け、1つの改行は行の折り返しにする
 * - 「## 」で始まる段落は見出しにする(書庫の文書用)
 */

const TOKEN = /\[\[(?:(L3|L4|O5)\s*[:：]\s*)?([\s\S]+?)\]\]|\[注(\d+)\]/g;

function renderInline(text: string, clearance: Clearance, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const key = `${keyPrefix}-${index++}`;
    if (match[2] !== undefined) {
      const body = match[2];
      const required = parseRedaction(match[1]) ?? fallbackLevel(body);
      nodes.push(
        hasClearance(clearance, required) ? (
          <Declassified key={key} text={body} />
        ) : (
          <Redacted key={key} required={required}>
            {maskText(body)}
          </Redacted>
        ),
      );
    } else {
      const n = match[3];
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
      {normalized.split(/\n{2,}/).map((paragraph, p) =>
        paragraph.startsWith("## ") ? (
          <h3 key={p} className="mb-2 mt-6 font-bold">
            {lines(paragraph.slice(3), p)}
          </h3>
        ) : (
          <p key={p} className={className}>
            {lines(paragraph, p)}
          </p>
        ),
      )}
    </>
  );
}
