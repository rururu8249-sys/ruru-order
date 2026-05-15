// app/layout.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/layout.tsx
//
// 역할:
// - 공통 상단바
// - 공지 팝업
// - 전체 페이지 layout
//
// 적용:
// 첫 접속시 공지 팝업 표시
// 하루동안 닫기 지원
// /admin 제외 상단바 유지

import type { Metadata } from "next";
import "./globals.css";

import PublicTopNav from "./components/PublicTopNav";
import NoticePopup from "./components/NoticePopup";

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

        <PublicTopNav />

        <NoticePopup />

        {children}

      </body>
    </html>
  );
}
