"use client";

type PaymentOrderRowProps = {
  orderCode: string;
  createdAtLabel: string;
  nickname: string;
  customerName: string;
  itemSummary: string;
  expectedAmountText: string;
  candidateCount: number;
  unpaid: boolean;
  onOpenManualMatch: () => void;
};

export default function PaymentOrderRow({
  orderCode,
  createdAtLabel,
  nickname,
  customerName,
  itemSummary,
  expectedAmountText,
  candidateCount,
  unpaid,
  onOpenManualMatch,
}: PaymentOrderRowProps) {
  return (
    <article className="grid gap-2 px-3 py-3 text-sm lg:grid-cols-[86px_130px_130px_minmax(240px,1fr)_110px_100px_140px] lg:items-center">
      <div className="font-black text-neutral-500">{orderCode}</div>

      <div className="text-[12px] font-bold text-neutral-500">{createdAtLabel}</div>

      <div>
        <div className="font-black">{nickname || "-"}</div>
        <div className="text-[11px] font-bold text-neutral-500">{customerName || "-"}</div>
      </div>

      <div className="break-keep font-bold text-neutral-700">{itemSummary}</div>

      <div className="text-left font-black lg:text-right">{expectedAmountText}</div>

      <div className="text-left lg:text-center">
        {candidateCount > 0 ? (
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black text-emerald-700">
            후보 {candidateCount}
          </span>
        ) : (
          <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-black text-neutral-400">
            -
          </span>
        )}
      </div>

      <div className="text-left lg:text-center">
        {unpaid ? (
          <button
            type="button"
            onClick={onOpenManualMatch}
            className="rounded-lg bg-neutral-950 px-3 py-2 text-[12px] font-black text-white active:scale-[0.98]"
          >
            입금 매칭하기
          </button>
        ) : (
          <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-black text-emerald-700">
            결제완료
          </span>
        )}
      </div>
    </article>
  );
}
