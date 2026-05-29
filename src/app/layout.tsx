import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PDF ビューア＆エディタ",
  description:
    "ブラウザ内で完結する PDF の閲覧・編集ツール。ファイルはサーバーに送信されません。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        body 自体はレイアウト用の flex/overflow コンテナにしない。
        pdf.js の TextLayer は計測用 <canvas class="hiddenCanvasElement"> を
        document.body へ直接 append するため、body を flex 化すると、その canvas が
        アプリの flex 兄弟になりレイアウト崩れ・クリック妨害を起こす。
        アプリは専用ラッパ div に閉じ込め、body は単純なブロック（はみ出しは clip）にする。
      */}
      <body className="h-full overflow-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex h-full flex-col overflow-hidden">{children}</div>
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
