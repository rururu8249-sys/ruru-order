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
    <div className="min-w-0">
      <div className="truncate text-[13px] font-black text-neutral-700">
        {paymentMethod || "-"}
      </div>

      <div className={`mt-0.5 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-black ${paymentClassName}`}>
        {paymentLabel}
      </div>

      {isBankUnpaid ? (
        <button
          type="button"
          onClick={onOpenManualMatch}
          className="mt-1 block rounded-md bg-neutral-950 px-2.5 py-1.5 text-[11px] font-black text-white active:scale-[0.98]"
        >
          입금 매칭하기
        </button>
      ) : isBankPaid ? (
        <div className="mt-1 inline-flex rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
          결제완료
        </div>
      ) : null}
    </div>
  );
}
