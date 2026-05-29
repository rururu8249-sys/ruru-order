import PresenceHeartbeat from "@/components/PresenceHeartbeat";
// app/layout.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/layout.tsx
//
// 핵심 수정:
// - layout에서 홈 메뉴/주문서/관리자 화면을 절대 직접 렌더링하지 않음
// - 모든 페이지는 각자 page.tsx만 표시
// - /order에서 홈 화면이 위에 같이 뜨는 문제 방지
// - /admin에서 고객 홈/주문서가 같이 뜨는 문제 방지

import type { Metadata } from "next";
import "./globals.css";
import AdminConfirmHost from "@/components/admin/AdminConfirmHost";
import DeployChunkReloadGuard from "@/components/DeployChunkReloadGuard";

import CustomerAccessBlockGuard from "@/components/customer/CustomerAccessBlockGuard";
export const metadata: Metadata = {
  title: "루루동이 집구석LIVE",
  description: "루루동이 주문 시스템",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <DeployChunkReloadGuard />
        <CustomerAccessBlockGuard />
        <PresenceHeartbeat />{children}
        <AdminConfirmHost /></body>
    </html>
  );
}
