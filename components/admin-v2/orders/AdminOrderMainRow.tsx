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
    <div className="grid w-full gap-1 border-t border-neutral-100 px-3 py-2 text-[13px] first:border-t-0 lg:grid-cols-[78px_104px_120px_minmax(280px,1fr)_82px_88px_86px_54px] lg:items-center">
      <div className="truncate font-black text-neutral-500" title={orderCode}>
        {orderCode}
      </div>

      <div className="font-bold leading-tight text-neutral-500">
        {createdAtLabel}
      </div>

      <div className="min-w-0" title={customerLine || nickname || ""}>
        <div className="truncate text-[14px] font-black text-neutral-950">
          {nickname || "-"}
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[14px] font-bold text-neutral-800" title={itemSummary}>
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
