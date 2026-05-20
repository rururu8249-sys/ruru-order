"use client";

import type { ReactNode } from "react";

type AdminOrderTablePanelProps = {
  children: ReactNode;
};

/**
 * 주문관리 테이블 영역 wrapper
 *
 * - 테이블 바깥 박스만 분리한다.
 * - 주문목록/상태변경/입금매칭/금액/정산 로직은 app/admin/page.tsx에 그대로 둔다.
 * - 다음 단계에서 테이블 본문/행/셀을 순서대로 분리한다.
 */
export default function AdminOrderTablePanel({
  children,
}: AdminOrderTablePanelProps) {
  return (
    <section className="bg-white rounded-[2rem] p-4 md:p-5 border shadow-sm">
      {children}
    </section>
  );
}
