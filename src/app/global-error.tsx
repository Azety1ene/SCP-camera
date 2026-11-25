"use client";

/**
 * 共通の枠(layout)ごと描けなくなったとき。globals.css も読み込まれないので、見た目はここで直接指定する
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#121210",
          color: "#e5e1d6",
          fontFamily: "ui-monospace, monospace",
          padding: "0 16px",
        }}
      >
        <title>[システム障害] | SCP財団 統合観測端末</title>
        <main style={{ width: "100%", maxWidth: 480, border: "2px solid #b53429", background: "#1a1917" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "1px solid #58554c",
              background: "#0b0b0a",
              padding: "8px 16px",
              fontSize: 11,
            }}
          >
            <span style={{ color: "#df6456", fontWeight: 700 }}>SYSTEM FAULT</span>
            <span style={{ color: "#969184" }}>記録・情報保安管理局</span>
          </div>
          <div style={{ padding: 24, lineHeight: 1.8, fontSize: 13 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>統合観測ネットワークに接続できません</p>
            <p style={{ margin: "12px 0 0", color: "#969184" }}>端末の起動中に重大な障害を検知しました。時間をおいて再試行してください。</p>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                marginTop: 20,
                padding: "10px 20px",
                background: "#e5e1d6",
                color: "#121210",
                border: "1px solid #e5e1d6",
                fontFamily: "inherit",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              再試行する
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
