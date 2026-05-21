"use client";

// components/admin-v2/today/AdminTodayWorkItemStatusPills.tsx
// 목적: 오늘할일 카드에서 주문상태와 배송처리단계를 분리 표시
// 주의: UI 표시 전용. 주문/입금/배송/정산 저장 로직 없음.

type AdminTodayWorkItemStatusPillsProps = {
  orderStatusText?: string;
  deliveryStageText?: string;
};

function orderTone(label: string) {
  if (label.includes("취소")) return "bg-red-50 text-red-700 border-red-100";
  if (label.includes("미결제")) return "bg-amber-50 text-amber-800 border-amber-100";
  if (label.includes("카드미결제")) return "bg-rose-50 text-rose-700 border-rose-100";
  if (label.includes("결제완료")) return "bg-emerald-50 text-emerald-700 border-emerald-100";
  return "bg-neutral-100 text-neutral-700 border-neutral-200";
}

function deliveryTone(label: string) {
  if (label === "미설정") return "bg-neutral-100 text-neutral-600 border-neutral-200";
  if (label === "포장전") return "bg-blue-50 text-blue-700 border-blue-100";
  if (label === "발송완료") return "bg-indigo-50 text-indigo-700 border-indigo-100";
  if (label.includes("킵")) return "bg-violet-50 text-violet-700 border-violet-100";
  if (label.includes("픽업")) return "bg-cyan-50 text-cyan-700 border-cyan-100";
  return "bg-neutral-100 text-neutral-700 border-neutral-200";
}

export default function AdminTodayWorkItemStatusPills({
  orderStatusText = "상태확인",
  deliveryStageText = "미설정",
}: AdminTodayWorkItemStatusPillsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black ${orderTone(orderStatusText)}`}>
        주문상태: {orderStatusText}
      </span>
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black ${deliveryTone(deliveryStageText)}`}>
        배송처리: {deliveryStageText}
      </span>
    </div>
  );
}
