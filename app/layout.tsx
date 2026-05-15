// app/layout.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/layout.tsx
//
// 역할:
// - 사이트 전체 레이아웃
// - 고객용 상단바 연결
// - 공지 팝업 연결
// - 고객 페이지 보안차단 연결

import type { Metadata } from "next";
import "./globals.css";

import PublicTopNav from "./components/PublicTopNav";
import NoticePopup from "./components/NoticePopup";
import SecurityBlocker from "./components/SecurityBlocker";

export const metadata: Metadata = {
  title: "루루동이 LIVE ORDER",
  description: "루루동이 라이브 주문 접수 및 주문내역 조회",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900">

        <SecurityBlocker />

        <PublicTopNav />

        <NoticePopup />

        {children}

      </body>
    </html>
  );
}
