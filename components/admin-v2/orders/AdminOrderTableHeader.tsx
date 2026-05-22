"use client";

// components/admin-v2/orders/AdminOrderTableHeader.tsx
// 목적: 주문관리 테이블 헤더
// 주의: UI 표시 순서 전용. 주문/입금/배송/정산 DB 저장 로직 없음.

import type { ReactNode } from "react";

export const ADMIN_ORDER_GRID =
  "grid-cols-[44px_0.95fr_0.9fr_1fr_1fr_minmax(260px,2.4fr)_0.55fr_0.9fr_0.75fr_0.9fr_0.65fr]";

type AdminOrderTableHeaderProps = {
  selectNode?: ReactNode;
};

function SortLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-1">
      <span>{children}</span>
      <span className="text-[11px] text-neutral-400">↕</span>
    </div>
  );
}

export default function AdminOrderTableHeader({ selectNode }: AdminOrderTableHeaderProps) {
  return (
    <div className={`hidden w-full ${ADMIN_ORDER_GRID} border-b border-neutral-200 bg-white px-5 py-3 text-[13px] font-black text-neutral-800 lg:grid`}>
      <div className="flex justify-center">{selectNode}</div>
      <div className="text-center">주문상태</div>
      <SortLabel>주문번호</SortLabel>
      <SortLabel>주문일시</SortLabel>
      <div className="text-center">닉네임</div>
      <div className="text-center">주문내역</div>
      <div className="text-center">수량</div>
      <SortLabel>결제금액</SortLabel>
      <div className="text-center">배송비</div>
      <div className="text-center">배송처리</div>
      <div className="text-center">상세</div>
    </div>
  );
}
