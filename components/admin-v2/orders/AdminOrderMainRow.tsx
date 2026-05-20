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
    <div className="grid gap-1 px-3 py-2 text-[13px] lg:grid-cols-[70px_104px_112px_minmax(280px,1fr)_84px_96px_88px_62px] lg:items-center">
      <div className="font-black text-neutral-500">{orderCode}</div>

      <div className="font-bold text-neutral-500">{createdAtLabel}</div>

      <div className="min-w-0" title={customerLine || ""}>
        <div className="truncate text-[14px] font-black">{nickname || "-"}</div>
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
