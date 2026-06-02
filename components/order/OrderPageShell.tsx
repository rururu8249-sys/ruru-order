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
      className="min-h-screen bg-[#fdf5f1] px-2 py-4 text-[#151923] select-none sm:px-4"
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className="mx-auto w-full max-w-[560px]">{children}</section>
    </main>
  );
}
