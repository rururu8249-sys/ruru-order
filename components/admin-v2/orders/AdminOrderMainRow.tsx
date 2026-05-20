"use client";

import type { ReactNode } from "react";

type AdminOrderMainRowProps = {
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
    <div className="grid w-full min-w-[1240px] gap-4 border-t border-neutral-100 px-6 py-4 text-[14px] first:border-t-0 hover:bg-neutral-50 lg:grid-cols-[120px_140px_170px_minmax(420px,1fr)_120px_120px_130px_80px] lg:items-center">
      <div className="truncate text-center font-black text-neutral-500" title={orderCode}>
        {orderCode}
      </div>

      <div className="text-center font-bold leading-snug text-neutral-500">
        {createdAtLabel}
      </div>

      <div className="min-w-0 text-center" title={customerLine || nickname || ""}>
        <div className="truncate text-[15px] font-black text-neutral-950">
          {nickname || "-"}
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[15px] font-bold text-neutral-800" title={itemSummary}>
          {itemSummary}
        </div>
      </div>

      <div className="flex justify-center">{paymentNode}</div>
      <div className="flex justify-end">{amountNode}</div>
      <div className="flex justify-center">{statusNode}</div>
      <div className="flex justify-center">{detailNode}</div>
    </div>
  );
}
