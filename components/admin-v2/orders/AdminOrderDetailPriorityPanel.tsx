"use client";

// components/admin-v2/orders/AdminOrderDetailPriorityPanel.tsx
// 목적: 주문상세 최상단에서 지금 해야 할 일을 한눈에 보여줌
// 주의: UI 표시 전용. 돈/입금/배송/정산 저장 로직 없음.

import type { OrderGroup } from "@/lib/admin-v2/types";
import { money } from "@/lib/admin-v2/formatters";
import {
  getOrderStatusValue,
  isBankUnpaid,
  isCardUnpaid,
  paymentStatusMeta,
} from "@/lib/admin-v2/orderHelpers";
import { getDeliveryStageStatusLabel } from "@/lib/admin-v2/statusDisplay";

type Props = {
  group: OrderGroup;
};

function chipClass(tone: "danger" | "warn" | "good" | "blue" | "neutral") {
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-neutral-200 bg-neutral-100 text-neutral-700";
}

export default function AdminOrderDetailPriorityPanel({ group }: Props) {
  const first = group.first;
  const rawStatus = getOrderStatusValue(first);
  const paymentMeta = paymentStatusMeta(first);
  const deliveryStage = getDeliveryStageStatusLabel(rawStatus);

  const canceled = rawStatus === "주문취소" || rawStatus === "주문서취소";
  const bankUnpaid = isBankUnpaid(first);
  const cardUnpaid = isCardUnpaid(first);
  const shipped = rawStatus === "출고완료" || Boolean(first.shipped_at);
  const hasTracking = Boolean(String(first.tracking_number || "").trim());

  let title = "처리 상태 확인";
  let desc = "주문상태와 배송처리를 확인하세요.";
  let tone: "danger" | "warn" | "good" | "blue" | "neutral" = "neutral";

  if (canceled) {
    title = "주문서 취소 상태";
    desc = "복구가 필요하면 취소 상태를 먼저 확인하세요.";
    tone = "danger";
  } else if (bankUnpaid) {
    title = "입금확인 필요";
    desc = "입금 매칭 또는 실제 확인 후 수동 결제완료 처리가 필요합니다.";
    tone = "warn";
  } else if (cardUnpaid) {
    title = "카드결제 확인 필요";
    desc = "카드 결제 여부를 확인한 뒤 처리하세요.";
    tone = "warn";
  } else if (!shipped) {
    title = hasTracking ? "출고완료 처리 필요" : "배송처리 필요";
    desc = hasTracking
      ? "송장번호가 있습니다. 발송완료 처리 여부를 확인하세요."
      : "결제는 끝났고, 송장/배송처리 확인이 필요합니다.";
    tone = "blue";
  } else {
    title = "처리완료 확인";
    desc = "결제와 발송 처리가 완료된 주문입니다.";
    tone = "good";
  }

  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${chipClass(tone)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-black opacity-70">지금 해야 할 일</div>
          <div className="mt-1 text-[26px] font-black tracking-[-0.06em]">
            {title}
          </div>
          <div className="mt-1 text-[13px] font-bold opacity-80">
            {desc}
          </div>
        </div>

        <div className="grid min-w-[260px] gap-1.5 rounded-2xl bg-white/80 p-3 text-[13px] font-black">
          <div className="flex justify-between gap-4">
            <span className="text-neutral-400">주문상태</span>
            <span>{paymentMeta.label}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-400">배송처리</span>
            <span>{deliveryStage}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-neutral-400">최종금액</span>
            <span className="text-red-600">{money(group.totalAmount)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
