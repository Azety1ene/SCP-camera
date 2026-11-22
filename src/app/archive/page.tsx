import { Suspense } from "react";
import { ArchiveList } from "./ArchiveList";

export default function ArchivePage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-muted">記録を読み込み中 …</p>}>
      <ArchiveList />
    </Suspense>
  );
}
