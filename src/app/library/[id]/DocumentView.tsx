"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { TerminalShell } from "@/components/TerminalShell.tsx";
import { BackIcon } from "@/components/Icons.tsx";
import { RichText } from "@/components/report/RichText.tsx";
import { ClassifiedStamp } from "@/components/report/AcsBar.tsx";
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
    <div className="glitch-in border-2 border-danger/70 px-4 py-8 text-center">
      <p className="text-sm font-bold tracking-[0.3em] text-danger">ACCESS DENIED</p>
      <p className="mt-3 text-xs leading-6 text-muted">
        この文書の閲覧には {CLEARANCE_LABEL[doc.required]} 以上のクリアランスが必要です。
        <br />
        あなたのクリアランス({clearance})では閲覧できません。
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
    <form onSubmit={onSubmit} className="glitch-in border border-line bg-panel/60 px-4 py-6 text-sm">
      <p className="font-bold">この文書はパスコードで保護されています</p>
      <p className="mt-2 text-xs leading-6 text-muted">パスコードは、所管部門から別途通知されます。</p>
      <div className="mt-4 flex items-center gap-2 border-b border-line focus-within:border-accent">
        <span className="text-accent">&gt;</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label="パスコード"
          className="w-full bg-transparent py-2 text-foreground outline-none"
        />
      </div>
      {message && <p className="mt-2 text-xs text-danger">{message}</p>}
      <button type="submit" className="btn btn-primary mt-4 w-full">
        解錠する
      </button>
    </form>
  );
}

export function DocumentView() {
  const { id } = useParams<{ id: string }>();
  const staff = useStaff();
  const unlocked = useUnlockedDocs();
  const doc = findDocument(id);

  if (!staff) return <p className="px-4 py-12 text-sm text-muted">職員認証を確認中 …</p>;

  return (
    <TerminalShell staff={staff}>
      <Link href="/library" className="btn btn-secondary mb-4 self-start">
        <BackIcon className="h-4 w-4" />
        書庫に戻る
      </Link>
      {!doc ? (
        <p className="text-sm text-danger">該当する文書は存在しません。</p>
      ) : !hasClearance(staff.clearance, doc.required) ? (
        <Denied doc={doc} clearance={CLEARANCE_LABEL[staff.clearance]} />
      ) : doc.passcode && staff.clearance !== "O5" && !unlocked.includes(doc.id) ? (
        <PasscodeGate doc={doc} />
      ) : (
        <article className="glitch-in relative bg-paper px-5 pb-10 pt-6 font-doc text-[15px] leading-[1.9] text-ink shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_20px_60px_rgba(0,0,0,0.6)] sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink pb-2 font-mono text-[11px] tracking-wider">
            <span>{doc.issuer}</span>
            <span>{doc.number}</span>
          </div>
          {doc.required !== "L2" && <ClassifiedStamp />}
          <h2 className="mt-6 pr-20 text-xl font-bold leading-snug">{doc.title}</h2>
          <p className="mt-1 font-mono text-[11px] text-ink/60">閲覧区分: {CLEARANCE_LABEL[doc.required]} 以上</p>
          <div className="mt-4">
            <RichText text={doc.body} clearance={staff.clearance} className="mb-3" />
          </div>
        </article>
      )}
    </TerminalShell>
  );
}
