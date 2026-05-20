"use client";

type PaymentStatusBadgeProps = {
  unpaid: boolean;
};

export default function PaymentStatusBadge({ unpaid }: PaymentStatusBadgeProps) {
  if (unpaid) {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-black text-rose-700">
        미입금
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">
      결제완료
    </span>
  );
}
