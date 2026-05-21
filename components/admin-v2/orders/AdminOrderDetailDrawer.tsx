"use client";

// components/admin-v2/orders/AdminOrderDetailDrawer.tsx
// 목적: 주문관리 상세보기를 행 펼침이 아니라 우측 슬라이드 패널로 표시
// 주의: UI 배치 전용. 돈/입금/배송/정산 저장 로직 없음.

import { useEffect } from "react";
import type {
  MoneyEditLogRow,
  OrderGroup,
  OrderRow,
  StatusChangeLogRow,
} from "@/lib/admin-v2/types";
import { displayOrderPhone, formatDateLabel, money } from "@/lib/admin-v2/formatters";
import AdminOrderDetailBlock from "@/components/admin-v2/orders/AdminOrderDetailBlock";

type AdminOrderDetailDrawerProps = {
  group: OrderGroup | null;
  moneyEditLogs: MoneyEditLogRow[];
  statusChangeLogs: StatusChangeLogRow[];
  onClose: () => void;
  onTrackingChange: (
    group: OrderGroup,
    trackingCompany: string,
    trackingNumber: string
  ) => Promise<void>;
  onFinalAmountChange: (
    row: OrderRow,
    nextAmount: number,
    reason: string
  ) => Promise<void>;
};

export default function AdminOrderDetailDrawer({
  group,
  moneyEditLogs,
  statusChangeLogs,
  onClose,
  onTrackingChange,
  onFinalAmountChange,
}: AdminOrderDetailDrawerProps) {
  useEffect(() => {
    if (!group) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [group, onClose]);

  if (!group) return null;

  const first = group.first;
  const orderCode = first.order_lookup_code || group.groupId || "-";
  const nickname = first.youtube_nickname || first.customer_name || "-";
  const phone = displayOrderPhone(first);
  const createdAt = first.created_at ? formatDateLabel(first.created_at) : "-";

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/35 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-[1180px] flex-col bg-neutral-50 shadow-[-18px_0_48px_rgba(15,23,42,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-black text-blue-600">주문 상세 · 빠른처리</div>
              <h2 className="mt-1 truncate text-2xl font-black tracking-[-0.05em] text-neutral-950">
                {nickname}
              </h2>
              <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-neutral-500">
                <span>주문키 {orderCode}</span>
                <span>·</span>
                <span>{createdAt}</span>
                <span>·</span>
                <span>{phone || "전화번호 없음"}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-2xl bg-blue-50 px-4 py-2 text-right">
                <div className="text-[11px] font-black text-blue-500">현재 최종금액</div>
                <div className="text-lg font-black text-blue-700">{money(group.totalAmount)}</div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-black text-neutral-800 active:scale-[0.98]"
              >
                닫기
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AdminOrderDetailBlock
            group={group}
            moneyEditLogs={moneyEditLogs}
            statusChangeLogs={statusChangeLogs}
            onTrackingChange={onTrackingChange}
            onFinalAmountChange={onFinalAmountChange}
          />
        </div>

        <footer className="border-t border-neutral-200 bg-white px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-neutral-500">
              목록은 유지되고, 상세에서 지금 처리할 일을 먼저 확인합니다.
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl bg-neutral-950 px-5 text-sm font-black text-white active:scale-[0.98]"
            >
              닫기
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
