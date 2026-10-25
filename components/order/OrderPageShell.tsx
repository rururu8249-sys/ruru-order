// components/order/OrderPageShell.tsx
// 목적: 고객 주문서 페이지 공통 외곽 디자인
// 주의: 주문 저장, 금액, 카드수수료, Supabase 로직 없음

import type { ReactNode } from "react";

type OrderPageShellProps = {
  children: ReactNode;
  // [㉜] 손님화면 새 모양(ui=v2) — 바탕 흰색(DESIGN.md canvas). 없으면 기존 그대로.
  tone?: "v2";
  // [㊶ 7단계] 새 모양 좌우 여백 16px 하나로(8px → 16px). 없으면 기존 그대로.
  edge16?: boolean;
  // [2026-10-25] PC 모양(폭 1024 이상 + ?preview=pc) — 가운데 칸 560 → 1120.
  wide?: boolean;
};

export default function OrderPageShell({ children, tone, edge16, wide }: OrderPageShellProps) {
  return (
    <main
      className={tone === "v2" ? (edge16 ? "min-h-screen bg-white px-4 py-4 text-[#111111] select-none" : "min-h-screen bg-white px-2 py-4 text-[#111111] select-none sm:px-4") : "min-h-screen bg-[#F6F4F2] px-2 py-4 text-[#151923] select-none sm:px-4"}
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <section className={wide ? "mx-auto w-full max-w-[1120px]" : "mx-auto w-full max-w-[560px]"}>{children}</section>
    </main>
  );
}
