"use client";

// components/admin-v2/orders/AdminOrderPaymentBadge.tsx
// 목적: 주문관리 입금상태 표시 전용 UI
// 주의: UI 전용. 입금확인 처리, 입금매칭, 금액 계산, Supabase 저장 로직 없음.

type AdminOrderPaymentBadgeProps = {
  label: string;
  desc?: string;
  className: string;
};

export default function AdminOrderPaymentBadge({
  label,
  desc,
  className,
}: AdminOrderPaymentBadgeProps) {
  return (
    <div className="flex min-w-[92px] flex-col items-center gap-0.5">
      <div
        className={`inline-flex min-w-[84px] justify-center rounded-lg px-2.5 py-1.5 text-[11px] font-black ${className}`}
        title={desc || label}
      >
        {label}
      </div>

      {desc ? (
        <div className="max-w-[96px] truncate text-[10px] font-bold text-neutral-400" title={desc}>
          {desc}
        </div>
      ) : null}
    </div>
  );
}
