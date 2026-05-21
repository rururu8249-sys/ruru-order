"use client";

// components/admin-v2/payment/ManualPaymentSelectionSummary.tsx
// 목적: 수동입금매칭에서 입금예정금액, 선택합계, 차액을 크게 표시
// 주의: UI 표시 전용. 입금확인 저장, 자동매칭, 돈계산 저장 로직 없음.

type ManualPaymentSelectionSummaryProps = {
  expectedAmount: number;
  selectedTotalAmount: number;
  selectedCount: number;
  amountDifference: number;
};

function money(value: number) {
  return `${Number(value || 0).toLocaleString()}원`;
}

export default function ManualPaymentSelectionSummary({
  expectedAmount,
  selectedTotalAmount,
  selectedCount,
  amountDifference,
}: ManualPaymentSelectionSummaryProps) {
  const exact = selectedCount > 0 && expectedAmount > 0 && amountDifference === 0;

  return (
    <div className={[
      "mt-3 grid gap-2 rounded-2xl border p-3 md:grid-cols-4",
      exact ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
    ].join(" ")}>
      <div>
        <div className="text-[11px] font-black text-neutral-500">입금예정금액</div>
        <div className="mt-1 text-lg font-black text-neutral-950">{money(expectedAmount)}</div>
      </div>

      <div>
        <div className="text-[11px] font-black text-neutral-500">선택한 입금</div>
        <div className="mt-1 text-lg font-black text-neutral-950">{selectedCount.toLocaleString()}건</div>
      </div>

      <div>
        <div className="text-[11px] font-black text-neutral-500">선택합계</div>
        <div className="mt-1 text-lg font-black text-neutral-950">{money(selectedTotalAmount)}</div>
      </div>

      <div>
        <div className="text-[11px] font-black text-neutral-500">차액</div>
        <div className={`mt-1 text-lg font-black ${exact ? "text-emerald-700" : "text-red-700"}`}>
          {money(amountDifference)}
        </div>
      </div>

      <div className={`md:col-span-4 rounded-xl px-3 py-2 text-[12px] font-black ${exact ? "bg-white/70 text-emerald-700" : "bg-white/70 text-amber-800"}`}>
        {exact
          ? "선택합계가 입금예정금액과 정확히 일치합니다. 수동매칭 가능합니다."
          : "선택합계와 입금예정금액이 같아야 수동매칭할 수 있습니다."}
      </div>
    </div>
  );
}
