import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Overview診断ツール",
  description: "ローカルLLMとルールベースで記事構造を診断する自分用MVP"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
