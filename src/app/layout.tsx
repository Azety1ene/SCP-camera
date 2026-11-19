import type { Metadata, Viewport } from "next";
import { M_PLUS_1_Code, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { AudioUnlocker } from "@/components/SoundToggle.tsx";

// 端末の文字(等幅)
const terminalFont = M_PLUS_1_Code({
  variable: "--font-terminal",
  weight: ["400", "700"],
  preload: false,
});

// 報告書の本文
const documentFont = Noto_Sans_JP({
  variable: "--font-document",
  weight: ["400", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "SCP財団 統合観測端末",
  description: "身の回りの物を撮影すると、その物のSCP報告書(日本支部風)が生成される観測端末。",
};

export const viewport: Viewport = {
  themeColor: "#07090a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${terminalFont.variable} ${documentFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <AudioUnlocker />
        {/* 画面全体にかかる走査線とちらつき */}
        <div aria-hidden className="crt-overlay" />
      </body>
    </html>
  );
}
