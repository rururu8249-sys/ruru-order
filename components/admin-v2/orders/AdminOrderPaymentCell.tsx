"use client";

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
  return (
    <div className="min-w-0" title={paymentMethod || paymentLabel || ""}>
      {isBankUnpaid ? (
        <button
          type="button"
          onClick={onOpenManualMatch}
          className="inline-flex min-w-[72px] justify-center rounded-lg bg-neutral-950 px-3 py-2 text-[12px] font-black text-white active:scale-[0.98]"
        >
          입금매칭
        </button>
      ) : isBankPaid ? (
        <div className="inline-flex min-w-[66px] justify-center rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-black text-emerald-700">
          결제완료
        </div>
      ) : (
        <div className={`inline-flex min-w-[66px] justify-center rounded-lg px-2.5 py-1.5 text-[11px] font-black ${paymentClassName}`}>
          {paymentLabel}
        </div>
      )}
    </div>
  );
}
