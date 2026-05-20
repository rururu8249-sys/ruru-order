"use client";

import type { ReactNode } from "react";

type AdminOrderMainRowProps = {
  orderCode: string;
  createdAtLabel: string;
  nickname: string;
  customerLine: string;
  itemSummary: string;
  amountText: string;
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
  amountText,
  paymentNode,
  statusNode,
  detailNode,
}: AdminOrderMainRowProps) {
  return (
    <div className="grid gap-2 px-3 py-2.5 lg:grid-cols-[84px_124px_128px_minmax(250px,1fr)_82px_108px_106px_90px] lg:items-center">
      <div className="text-[13px] font-black text-neutral-500">{orderCode}</div>

      <div className="text-[13px] font-bold text-neutral-500">{createdAtLabel}</div>

      <div className="min-w-0">
        <div className="truncate text-[15px] font-black">{nickname || "-"}</div>
        <div className="truncate text-[12px] font-bold text-neutral-500">
          {customerLine || "-"}
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[15px] font-bold text-neutral-800">
          {itemSummary}
        </div>
      </div>

      {paymentNode}

      <div className="text-left lg:text-right">
        <div className="text-[15px] font-black">{amountText}</div>
      </div>

      {statusNode}

      {detailNode}
    </div>
  );
}
