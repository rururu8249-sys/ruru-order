import type { Metadata } from "next";
import "./globals.css";
import SecurityBlocker from "@/app/components/SecurityBlocker";

export const metadata: Metadata = {
  title: "루루동이 라이브마켓",
  description: "루루동이 라이브 방송 주문서",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <SecurityBlocker />
        {children}
      </body>
    </html>
  );
}