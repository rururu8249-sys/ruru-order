"use client";

// components/admin-v2/orders/AdminOrderPaymentCell.tsx
// 목적: 주문관리 주문상태 + 미결제 주문 입금매칭 버튼 표시
// 주의: UI 전용. 입금확인 처리, 입금매칭 API, 금액 계산, Supabase 저장 로직 없음.

import AdminOrderPaymentBadge from "@/components/admin-v2/orders/AdminOrderPaymentBadge";

type AdminOrderPaymentCellProps = {
  paymentMethod: string;
  paymentLabel: string;
  paymentClassName: string;
  isBankUnpaid: boolean;
  isBankPaid: boolean;
  onOpenManualMatch: () => void;
};

export default function AdminOrderPaymentCell({
  paymentMethod,
  paymentLabel,
  paymentClassName,
  isBankUnpaid,
  isBankPaid,
  onOpenManualMatch,
}: AdminOrderPaymentCellProps) {
  const safePaymentMethod = paymentMethod || "";
  const safePaymentLabel = paymentLabel || "미결제";

  const displayLabel = isBankUnpaid ? "미결제" : safePaymentLabel;

  const displayDesc = isBankUnpaid
    ? "입금 매칭 필요"
    : isBankPaid
      ? safePaymentMethod || "무통장입금"
      : safePaymentMethod || "확인 필요";

  const displayClassName = isBankUnpaid
    ? "bg-amber-100 text-amber-800"
    : isBankPaid
      ? "bg-emerald-100 text-emerald-700"
      : paymentClassName;

  return (
    <div
      className="flex min-w-[128px] flex-col items-center justify-center gap-1.5"
      title={`${safePaymentMethod} / ${safePaymentLabel}`}
    >
      <AdminOrderPaymentBadge
        label={displayLabel}
        desc={displayDesc}
        className={displayClassName}
      />

      {isBankUnpaid ? (
        <button
          type="button"
          onClick={onOpenManualMatch}
          className="inline-flex min-w-[98px] justify-center rounded-lg bg-neutral-950 px-3 py-1.5 text-[12px] font-black text-white shadow-sm transition active:scale-[0.98]"
        >
          입금 매칭하기
        </button>
      ) : null}
    </div>
  );
}
