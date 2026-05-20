// components/order/OrderPageShell.tsx
// 목적: 고객 주문서 페이지 공통 외곽 디자인
// 주의: 주문 저장, 금액, 카드수수료, Supabase 로직 없음

import type { ReactNode } from "react";

type OrderPageShellProps = {
  children: ReactNode;
};

export default function OrderPageShell({ children }: OrderPageShellProps) {
  return (
    <main
      className="min-h-screen bg-[#f5f8ff] px-4 py-5 text-[#151923] select-none"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto w-full max-w-md">{children}</section>
    </main>
  );
}
