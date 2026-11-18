import { Suspense } from "react";
import { ReportView } from "./ReportView";

// 報告書はブラウザの IndexedDB に保存されるため、表示はクライアント側で行う。
// URLの id はリクエスト時にしか決まらないので、Suspense の内側で読む。
export default function ReportPage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-muted">財団データベースに照会中…</p>}>
      <ReportView />
    </Suspense>
  );
}
