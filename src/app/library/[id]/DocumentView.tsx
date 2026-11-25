"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { BackIcon } from "@/components/Icons.tsx";
import { RichText } from "@/components/report/RichText.tsx";
import { ApprovalBox, ClassifiedStamp } from "@/components/report/AcsBar.tsx";
import { useStaff } from "@/lib/client/progress.ts";
import { CLEARANCE_LABEL, hasClearance } from "@/lib/client/session.ts";
import { unlockDoc, useUnlockedDocs } from "@/lib/client/store.ts";
import { play } from "@/lib/client/sound.ts";
import { findDocument, type ArchiveDocument } from "@/lib/content/documents.ts";

function Denied({ doc, clearance }: { doc: ArchiveDocument; clearance: string }) {
  useEffect(() => {
    play("deny");
  }, []);
  return (
    <div className="border-2 border-seal bg-panel p-6 text-center">
      <p className="font-mono text-xs font-bold tracking-[0.2em] text-seal-text">閲覧拒否 // ACCESS DENIED</p>
      <p className="mt-3 text-xs leading-6 text-muted">
        この文書の閲覧には <span className="font-mono text-foreground">{CLEARANCE_LABEL[doc.required]}</span> 以上のクリアランスが必要です。
        <br />
        現在のクリアランス({clearance})では閲覧できません。
      </p>
    </div>
  );
}

function PasscodeGate({ doc }: { doc: ArchiveDocument }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // ひらがな・カタカナ・空白の違いは許す
    const normalize = (text: string) =>
      text
        .trim()
        .replace(/\s/g, "")
        .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    if (normalize(code) === normalize(doc.passcode ?? "")) {
      play("granted");
      unlockDoc(doc.id);
    } else {
      play("deny");
      setMessage("パスコードが一致しません。この試行は記録されました。");
      setCode("");
    }
  }

  return (
    <form onSubmit={onSubmit} className="ledger">
      <div className="ledger-title">
        <h2>文書解錠プロンプト</h2>
        <span className="font-mono text-[10px] font-normal text-warn">[施錠]</span>
      </div>
      <div className="bg-sunken p-5 text-sm">
        <p className="font-bold text-foreground">この文書はパスコードで保護されています</p>
        <p className="mt-1.5 text-xs leading-6 text-muted">パスコードは所管部門から別途通知されます。</p>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label="パスコード"
          placeholder="パスコードを入力"
          className="field-input mt-4"
        />
        {message && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {message}
          </p>
        )}
        <button type="submit" className="btn btn-primary mt-4 w-full sm:w-auto sm:min-w-40">
          解錠を実行する
        </button>
      </div>
    </form>
  );
}

export function DocumentView() {
  const { id } = useParams<{ id: string }>();
  const staff = useStaff();
  const unlocked = useUnlockedDocs();
  const doc = findDocument(id);

  if (!staff) return <p className="px-4 py-12 font-mono text-xs text-muted">職員認証を確認中 …</p>;

  return (
    <TerminalShell staff={staff} screen={{ id: "LIB-0410", name: "文書閲覧" }}>
      <Link href="/library" className="btn btn-secondary mb-4 self-start text-xs">
        <BackIcon className="h-4 w-4" />
        文書管理台帳に戻る
      </Link>
      {!doc ? (
        <p className="text-sm text-danger">該当する文書は存在しません。</p>
      ) : !hasClearance(staff.clearance, doc.required) ? (
        <Denied doc={doc} clearance={CLEARANCE_LABEL[staff.clearance]} />
      ) : doc.passcode && staff.clearance !== "O5" && !unlocked.includes(doc.id) ? (
        <PasscodeGate doc={doc} />
      ) : (
        <article data-classified className="paper-sheet px-5 pb-10 pt-6 font-doc text-[15px] leading-[1.9] sm:px-10">
          <div className="flex items-start justify-between gap-4 border-b-2 border-ink pb-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 font-mono text-[10.5px] leading-5 text-ink/80">
              <dt>発行</dt>
              <dd>{doc.issuer}</dd>
              <dt>番号</dt>
              <dd>{doc.number.replace(/^(文書番号|掲示物) /, "")}</dd>
              <dt>区分</dt>
              <dd>{CLEARANCE_LABEL[doc.required]} 以上</dd>
            </dl>
            <ApprovalBox stamps={doc.stamps} />
          </div>
          <div className="relative border-b border-ink/25 pb-4">
            <h2 className="mt-5 pr-20 text-xl font-bold leading-snug">{doc.title}</h2>
            {doc.required !== "L2" && <ClassifiedStamp />}
          </div>
          <div className="mt-5">
            <RichText text={doc.body} clearance={staff.clearance} className="mb-3" />
          </div>
        </article>
      )}
    </TerminalShell>
  );
}
