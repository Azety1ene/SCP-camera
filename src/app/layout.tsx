import type { Metadata, Viewport } from "next";
import { BIZ_UDPGothic, BIZ_UDPMincho, M_PLUS_1_Code } from "next/font/google";
import "./globals.css";
import { AudioUnlocker } from "@/components/SoundToggle.tsx";
import { AmbientEffects } from "@/components/AmbientEffects.tsx";

/*
 * 書体は「日本の官公庁の業務端末と公文書」を参照して決めている(docs/research/16-ai-slop.md)。
 * - UI: 自治体の公文書で採用が広がっている UD ゴシック
 * - 文書(報告書・書庫・メール): 公文書の明朝
 * - 端末の表示(起動ログ・番号・時刻・カメラ): 等幅
 */
const uiFont = BIZ_UDPGothic({
  variable: "--font-ui",
  weight: ["400", "700"],
  preload: false,
});

const documentFont = BIZ_UDPMincho({
  variable: "--font-document",
  weight: ["400", "700"],
  preload: false,
});

const terminalFont = M_PLUS_1_Code({
  variable: "--font-terminal",
  weight: ["400", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "SCP財団 統合観測端末",
  description: "身の回りの物を撮影すると、その物のSCP報告書(日本支部風)が生成される観測端末。",
};

export const viewport: Viewport = {
  themeColor: "#0d1012",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${uiFont.variable} ${documentFont.variable} ${terminalFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <AudioUnlocker />
        <AmbientEffects />
        {/* 画面全体にかかる走査線とちらつき */}
        <div aria-hidden className="crt-overlay" />
      </body>
    </html>
  );
}
