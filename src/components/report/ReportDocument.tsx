import { forwardRef, type ReactNode } from "react";
import type { GeneratedReport } from "@/lib/report/schema.ts";
import { CLEARANCE_LABEL, type Clearance } from "@/lib/client/session.ts";
import { RichText } from "./RichText.tsx";

type Addendum = GeneratedReport["addenda"][number];

/** 記録の形式ごとの見た目。会話やログは枠で囲み、手紙は便箋風にする */
const BOXED_FORMATS = new Set(["実験ログ", "インタビュー記録", "事案記録", "探査ログ", "対象と結果の表", "公的書式"]);
const LETTER_FORMATS = new Set(["手紙", "手記", "一人称の記録", "上位者の書状"]);

function AddendumBlock({ addendum, clearance }: { addendum: Addendum; clearance: Clearance }) {
  const body = <RichText text={addendum.body} clearance={clearance} className="mb-3 last:mb-0" />;
  let content: ReactNode = body;
  if (BOXED_FORMATS.has(addendum.format)) {
    content = <div className="border border-ink/25 bg-ink/[0.03] px-4 py-3 text-[0.95em]">{body}</div>;
  } else if (LETTER_FORMATS.has(addendum.format)) {
    content = <div className="border-l-4 border-ink/20 py-1 pl-4 italic">{body}</div>;
  }
  return (
    <section className="mt-7">
      <h3 className="mb-3 font-bold">{addendum.heading}</h3>
      {content}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <span className="font-bold">{label}: </span>
      {children}
    </div>
  );
}

export type ReportDocumentProps = {
  itemNumber: string;
  report: GeneratedReport;
  photoUrl: string;
  clearance: Clearance;
  recordedAt: Date;
};

/** 紙の機密文書として表示する報告書。画像書き出しの対象にもなるので ref を受け取る */
export const ReportDocument = forwardRef<HTMLElement, ReportDocumentProps>(function ReportDocument(
  { itemNumber, report, photoUrl, clearance, recordedAt },
  ref,
) {
  const isO5 = clearance === "O5";
  return (
    <article ref={ref} className="bg-paper px-5 pb-10 pt-6 font-doc text-[15px] leading-[1.9] text-ink shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_20px_60px_rgba(0,0,0,0.6)] sm:px-10">
      {/* 文書の帯 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink pb-2 font-mono text-[11px] tracking-wider">
        <span>SCP財団 記録・情報保安管理局</span>
        <span>
          閲覧権限: <span className={isO5 ? "font-bold text-[#a3241a]" : "font-bold"}>{CLEARANCE_LABEL[clearance]}</span>
        </span>
      </div>

      <h2 className="mt-6 text-xl font-bold leading-snug sm:text-2xl">
        {itemNumber} - {report.title}
      </h2>

      {/* 添付資料(撮影写真) */}
      <figure className="my-5 border border-ink/30 bg-white p-2 sm:float-right sm:my-1 sm:ml-6 sm:w-[46%]">
        {/* eslint-disable-next-line @next/next/no-img-element -- IndexedDB の Blob を表示するため */}
        <img src={photoUrl} alt={`${itemNumber} の記録画像`} className="w-full" />
        <figcaption className="mt-2 text-[12px] leading-relaxed">
          <RichText text={report.photoCaption} clearance={clearance} inline />
        </figcaption>
      </figure>

      <Field label="アイテム番号">{itemNumber}</Field>
      <Field label="オブジェクトクラス">{report.objectClass}</Field>

      <div className="mt-4">
        <span className="font-bold">特別収容プロトコル: </span>
        <RichText text={report.containmentProcedures} clearance={clearance} className="mb-3" />
      </div>

      <div className="mt-4">
        <span className="font-bold">説明: </span>
        <RichText text={report.description} clearance={clearance} className="mb-3" />
      </div>

      <div className="clear-both" />

      {report.addenda.map((addendum, i) => (
        <AddendumBlock key={i} addendum={addendum} clearance={clearance} />
      ))}

      {/* O5限定の補遺 */}
      <section className="mt-8">
        {isO5 ? (
          <div className="border-2 border-[#a3241a] p-4">
            <p className="mb-3 font-mono text-[11px] font-bold tracking-wider text-[#a3241a]">
              O5評議会 限定文書 ── 閲覧記録は保存されます
            </p>
            <AddendumBlock addendum={report.o5Addendum} clearance={clearance} />
          </div>
        ) : (
          <div className="border-2 border-ink bg-ink px-4 py-6 text-center font-mono text-paper">
            <p className="text-sm font-bold tracking-[0.3em]">ACCESS DENIED</p>
            <p className="mt-2 text-[12px] leading-relaxed">
              以下の補遺の閲覧にはO5評議会の承認が必要です。
              <br />
              あなたのクリアランス({CLEARANCE_LABEL[clearance]})では閲覧できません。
            </p>
          </div>
        )}
      </section>

      <div className="mt-8 border-t border-ink/30 pt-5 font-bold">
        <RichText text={report.closingLine} clearance={clearance} />
      </div>

      {report.footnotes.length > 0 && (
        <ol className="mt-8 border-t border-ink/20 pt-4 text-[12px] leading-relaxed">
          {report.footnotes.map((note, i) => (
            <li key={i} id={`fn-${i + 1}`} className="mb-1">
              {i + 1}. <RichText text={note} clearance={clearance} inline />
            </li>
          ))}
        </ol>
      )}

      <p className="mt-8 font-mono text-[10px] leading-relaxed text-ink/60">
        記録日時 {recordedAt.toLocaleString("ja-JP")} ／ 本文書は統合観測端末により自動作成された。
        <br />
        SCP財団の世界観は CC BY-SA 3.0 で公開されている創作に基づく。
      </p>
    </article>
  );
});
