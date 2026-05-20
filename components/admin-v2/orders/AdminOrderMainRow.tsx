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
    <div className="grid w-full gap-2 border-t border-neutral-100 px-4 py-3 text-[14px] first:border-t-0 hover:bg-neutral-50 lg:grid-cols-[92px_124px_140px_minmax(340px,1fr)_96px_104px_104px_64px] lg:items-center">
      <div className="truncate font-black text-neutral-500" title={orderCode}>
        {orderCode}
      </div>

      <div className="font-bold leading-snug text-neutral-500">
        {createdAtLabel}
      </div>

      <div className="min-w-0" title={customerLine || nickname || ""}>
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
      {amountNode}
      <div className="flex justify-center">{statusNode}</div>
      <div className="flex justify-center">{detailNode}</div>
    </div>
  );
}
