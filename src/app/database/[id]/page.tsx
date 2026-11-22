import { Suspense } from "react";
import { SharedReportView } from "./SharedReportView";

export default function SharedReportPage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-muted">財団データベースに照会中 …</p>}>
      <SharedReportView />
    </Suspense>
  );
}
