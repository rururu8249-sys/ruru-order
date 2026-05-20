"use client";

import type { ReactNode } from "react";

type AdminOrderDetailBoxProps = {
  title: string;
  children: ReactNode;
};

export default function AdminOrderDetailBox({
  title,
  children,
}: AdminOrderDetailBoxProps) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 text-[12px] font-bold text-neutral-700">
      <div className="mb-1 text-[12px] font-black text-neutral-950">
        {title}
      </div>
      <div className="grid gap-1">
        {children}
      </div>
    </div>
  );
}
