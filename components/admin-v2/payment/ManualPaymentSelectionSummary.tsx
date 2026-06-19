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
      exact ? "border-emerald-200 bg-ok-bg" : "border-amber-200 bg-warn-bg",
    ].join(" ")}>
      <div>
        <div className="text-[11px] font-black text-ink-soft">입금예정금액</div>
        <div className="mt-1 text-lg font-black text-ink">{money(expectedAmount)}</div>
      </div>

      <div>
        <div className="text-[11px] font-black text-ink-soft">선택한 입금</div>
        <div className="mt-1 text-lg font-black text-ink">{selectedCount.toLocaleString()}건</div>
      </div>

      <div>
        <div className="text-[11px] font-black text-ink-soft">선택합계</div>
        <div className="mt-1 text-lg font-black text-ink">{money(selectedTotalAmount)}</div>
      </div>

      <div>
        <div className="text-[11px] font-black text-ink-soft">차액</div>
        <div className={`mt-1 text-lg font-black ${exact ? "text-ok-tx" : "text-danger-tx"}`}>
          {money(amountDifference)}
        </div>
      </div>

      <div className={`md:col-span-4 rounded-xl px-3 py-2 text-[12px] font-black ${exact ? "bg-surface-2 text-ok-tx" : "bg-surface-2 text-amber-800"}`}>
        {exact
          ? "선택합계가 입금예정금액과 정확히 일치합니다. 수동매칭 가능합니다."
          : "금액이 달라도 관리자 확인 후 수동매칭할 수 있습니다. 차액을 꼭 확인하세요."}
      </div>
    </div>
  );
}
