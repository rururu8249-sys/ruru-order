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
  shippingFeeText: string;
  paymentNode: ReactNode;
  statusNode: ReactNode;
  detailNode: ReactNode;
};

function extractQty(summary: string) {
  const matches = String(summary || "").match(/x\s*(\d+)|(\d+)\s*개/g);
  if (!matches || matches.length === 0) return "1";

  const total = matches.reduce((sum, raw) => {
    const number = Number(String(raw).match(/\d+/)?.[0] || 0);
    return sum + number;
  }, 0);

  return String(total || 1);
}

function cleanOrderSummary(summary: string) {
  return String(summary || "-")
    .replace(/\s*x\s*\d+\s*개?/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export default function AdminOrderMainRow({
  selectNode,
  orderCode,
  createdAtLabel,
  nickname,
  customerLine,
  itemSummary,
  amountNode,
  shippingFeeText,
  paymentNode,
  statusNode,
  detailNode,
}: AdminOrderMainRowProps) {
  const qtyText = extractQty(itemSummary);
  const cleanSummary = cleanOrderSummary(itemSummary);

  return (
    <div className={`grid w-full ${ADMIN_ORDER_GRID} border-t border-neutral-100 bg-white px-5 py-3.5 text-[14px] first:border-t-0 hover:bg-neutral-50 lg:items-center`}>
      <div className="flex justify-center px-1">{selectNode}</div>

      <div className="min-w-0 px-2">
        <div className="flex w-full justify-center">{paymentNode}</div>
      </div>

      <div className="min-w-0 px-2 text-center">
        <div className="truncate font-black text-neutral-700" title={orderCode}>
          {orderCode || "-"}
        </div>
      </div>

      <div className="min-w-0 px-2 text-center">
        <div className="whitespace-pre-line text-[13px] font-bold leading-snug text-neutral-600">
          {createdAtLabel}
        </div>
      </div>

      <div className="min-w-0 px-2 text-center" title={customerLine || nickname || ""}>
        <div className="truncate text-[14px] font-black text-neutral-950">
          {nickname || "-"}
        </div>
      </div>

      <div className="min-w-0 px-3">
        <div className="truncate text-[14px] font-bold text-neutral-800" title={cleanSummary}>
          {cleanSummary || "-"}
        </div>
      </div>

      <div className="min-w-0 px-2 text-center">
        <div className="text-[14px] font-black text-neutral-900">{qtyText}</div>
      </div>

      <div className="min-w-0 px-2">
        <div className="flex w-full justify-end">{amountNode}</div>
      </div>

      <div className="min-w-0 px-2 text-center">
        <span className="text-[13px] font-black text-neutral-800">{shippingFeeText}</span>
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
