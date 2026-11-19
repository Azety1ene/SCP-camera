import { Suspense } from "react";
import { DocumentView } from "./DocumentView";

// 閲覧権限は端末側で判定するので、表示はクライアント側で行う
export default function DocumentPage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-muted">文書を照会中 …</p>}>
      <DocumentView />
    </Suspense>
  );
}
