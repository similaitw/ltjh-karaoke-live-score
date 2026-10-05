import type { Metadata } from "next";
import { CompetitionProvider } from "@/components/competition-provider";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "卡拉之聲 LIVE｜羅東國中",
  description: "羅東國中卡拉社即時競賽、評審評分與方向圖卡投票",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>
        <CompetitionProvider>
          <Shell>{children}</Shell>
        </CompetitionProvider>
      </body>
    </html>
  );
}
