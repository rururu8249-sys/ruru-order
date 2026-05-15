// app/layout.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/layout.tsx
//
// 역할:
// 사이트 전체 기본 레이아웃
// 고객용 상단바 PublicTopNav 연결
//
// 주의:
// PublicTopNav 내부에서
// - /admin 페이지에서는 자동 숨김
// - 첫화면 / 에서는 자동 숨김
// 처리됩니다.

import type { Metadata } from "next";
import "./globals.css";
import PublicTopNav from "./components/PublicTopNav";

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
      <body>
        <PublicTopNav />
        {children}
      </body>
    </html>
  );
}
