// app/layout.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";

import PublicTopNav from "./components/PublicTopNav";
import NoticePopup from "./components/NoticePopup";
import SecurityBlocker from "./components/SecurityBlocker";
import AdminRealtimeOrderAlert from "./components/AdminRealtimeOrderAlert";

export const metadata: Metadata = {
  title: "루루동이 집구석LIVE",
  description: "루루동이 라이브 주문서 작성 및 주문조회",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="bg-[#fbf7f8] text-gray-900">
        <SecurityBlocker />
        <PublicTopNav />
        <NoticePopup />
        <AdminRealtimeOrderAlert />
        {children}
      </body>
    </html>
  );
}
