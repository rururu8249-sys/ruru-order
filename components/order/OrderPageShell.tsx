// components/order/OrderPageShell.tsx
// 새 파일 생성
// 위치: /Users/ruru/Desktop/ruru-order-app/components/order/OrderPageShell.tsx
// 목적: 고객 주문서 페이지 공통 외곽 디자인
// 주의: 주문 저장, 금액, 카드수수료, Supabase 로직 없음

import type { ReactNode } from "react";

type OrderPageShellProps = {
  children: ReactNode;
};

export default function OrderPageShell({ children }: OrderPageShellProps) {
  return (
    <main
      className="min-h-screen bg-[#f8f1e8] px-4 py-5 text-[#241b17] select-none"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto w-full max-w-md">{children}</section>
    </main>
  );
}
