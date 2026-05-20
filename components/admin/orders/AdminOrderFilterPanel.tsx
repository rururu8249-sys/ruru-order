"use client";

import type { ReactNode } from "react";

type AdminOrderFilterPanelProps = {
  children: ReactNode;
};

/**
 * 주문관리 검색/필터 영역 wrapper
 *
 * 2차 분리 기준:
 * - 검색/필터 기능 로직은 아직 app/admin/page.tsx에 그대로 둔다.
 * - 화면 박스/레이아웃 wrapper만 먼저 분리한다.
 * - 돈/DB/입금매칭/정산 로직은 절대 건드리지 않는다.
 */
export default function AdminOrderFilterPanel({
  children,
}: AdminOrderFilterPanelProps) {
  return (
    <section className="bg-transparent p-0 border-0 shadow-none">
      {children}
    </section>
  );
}
