"use client";

import type { ReactNode } from "react";

export const ADMIN_ORDER_GRID =
  "grid-cols-[44px_0.82fr_1fr_1.05fr_minmax(260px,3fr)_0.9fr_0.9fr_0.95fr_0.68fr]";

type AdminOrderTableHeaderProps = {
  selectNode?: ReactNode;
};

export default function AdminOrderTableHeader({ selectNode }: AdminOrderTableHeaderProps) {
  return (
    <div className={`hidden w-full ${ADMIN_ORDER_GRID} bg-neutral-900 px-4 py-3 text-[13px] font-black text-white lg:grid`}>
      <div className="flex justify-center">{selectNode}</div>
      <div className="text-center">주문번호</div>
      <div className="text-center">주문시간</div>
      <div className="text-center">고객</div>
      <div className="text-center">상품명</div>
      <div className="text-center">주문상태</div>
      <div className="text-center">금액</div>
      <div className="text-center">배송처리단계</div>
      <div className="text-center">상세</div>
    </div>
  );
}
