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
    <div className="grid gap-1.5 px-3 py-2 text-[13px] lg:grid-cols-[76px_112px_124px_minmax(260px,1fr)_96px_104px_96px_72px] lg:items-center">
      <div className="font-black text-neutral-500">{orderCode}</div>

      <div className="font-bold text-neutral-500">{createdAtLabel}</div>

      <div className="min-w-0">
        <div className="truncate text-[14px] font-black">{nickname || "-"}</div>
        <div className="truncate text-[11px] font-bold text-neutral-500">
          {customerLine || "-"}
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[14px] font-bold text-neutral-800">
          {itemSummary}
        </div>
      </div>

      {paymentNode}
      {amountNode}
      {statusNode}
      {detailNode}
    </div>
  );
}
