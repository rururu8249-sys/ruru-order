"use client";

import { ADMIN_STATUS_TONES } from "@/components/admin-v2/ui/adminDesignSystem";

type PaymentStatusBadgeProps = {
  unpaid: boolean;
};

export default function PaymentStatusBadge({ unpaid }: PaymentStatusBadgeProps) {
  const label = unpaid ? "입금대기" : "입금확인";
  const tone = unpaid ? ADMIN_STATUS_TONES.unpaid : ADMIN_STATUS_TONES.autoPaid;

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black",
        tone,
      ].join(" ")}
    >
      {label}
    </span>
  );
}
