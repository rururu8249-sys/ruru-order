"use client";

// components/admin-v2/orders/AdminOrderPaymentCell.tsx
// 목적: 주문관리 입금상태 + 미입금 주문 입금매칭 버튼 표시
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
  const safePaymentLabel = paymentLabel || "결제확인 필요";

  const displayLabel = isBankUnpaid
    ? "입금대기"
    : isBankPaid
      ? safePaymentLabel
      : safePaymentLabel;

  const displayDesc = isBankUnpaid
    ? "입금매칭 필요"
    : isBankPaid
      ? safePaymentMethod || "입금확인"
      : safePaymentMethod || "확인 필요";

  const displayClassName = isBankUnpaid
    ? "bg-amber-100 text-amber-800"
    : isBankPaid
      ? "bg-emerald-100 text-emerald-700"
      : paymentClassName;

  return (
    <div
      className="flex min-w-[116px] flex-col items-center justify-center gap-1.5"
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
          className="inline-flex min-w-[84px] justify-center rounded-lg bg-neutral-950 px-3 py-1.5 text-[12px] font-black text-white shadow-sm transition active:scale-[0.98]"
        >
          입금매칭
        </button>
      ) : null}
    </div>
  );
}
