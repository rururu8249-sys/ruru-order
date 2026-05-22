"use client";

// components/admin-v2/orders/AdminOrderMainRow.tsx
// 목적: 주문관리 메인 행
// 주의: UI 표시 순서 전용. 주문/입금/배송/정산 DB 저장 로직 없음.

import type { ReactNode } from "react";
import { ADMIN_ORDER_GRID } from "@/components/admin-v2/orders/AdminOrderTableHeader";

type AdminOrderMainRowProps = {
  selectNode?: ReactNode;
  orderCode: string;
  createdAtLabel: string;
  nickname: string;
  customerLine: string;
  itemSummary: string;
  amountNode: ReactNode;
  paymentNode: ReactNode;
  statusNode: ReactNode;
  detailNode: ReactNode;
};

export default function AdminOrderMainRow({
  selectNode,
  orderCode,
  createdAtLabel,
  nickname,
  customerLine,
  itemSummary,
  amountNode,
  paymentNode,
  statusNode,
  detailNode,
}: AdminOrderMainRowProps) {
  return (
    <div className={`grid w-full ${ADMIN_ORDER_GRID} border-t border-neutral-100 px-4 py-4 text-[14px] first:border-t-0 hover:bg-neutral-50 lg:items-center`}>
      <div className="flex justify-center px-1">{selectNode}</div>

      <div className="min-w-0 px-2">
        <div className="flex w-full justify-center">{paymentNode}</div>
      </div>

      <div className="min-w-0 px-2 text-center">
        <div className="truncate font-black text-neutral-500" title={orderCode}>
          {orderCode}
        </div>
      </div>

      <div className="min-w-0 px-2 text-center">
        <div className="font-bold leading-snug text-neutral-500">
          {createdAtLabel}
        </div>
      </div>

      <div className="min-w-0 px-2 text-center" title={customerLine || nickname || ""}>
        <div className="truncate text-[15px] font-black text-neutral-950">
          {nickname || "-"}
        </div>
      </div>

      <div className="min-w-0 px-3">
        <div className="truncate text-[15px] font-bold text-neutral-800" title={itemSummary}>
          {itemSummary}
        </div>
      </div>

      <div className="min-w-0 px-2">
        <div className="flex w-full justify-end">{amountNode}</div>
      </div>

      <div className="min-w-0 px-2">
        <div className="flex w-full justify-center">{statusNode}</div>
      </div>

      <div className="min-w-0 px-2">
        <div className="flex w-full justify-center">{detailNode}</div>
      </div>
    </div>
  );
}
