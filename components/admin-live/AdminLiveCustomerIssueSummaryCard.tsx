"use client";

type AdminLiveCustomerIssueSummaryCardProps = {
  onOpenCustomers: () => void;
};

export default function AdminLiveCustomerIssueSummaryCard({
  onOpenCustomers,
}: AdminLiveCustomerIssueSummaryCardProps) {
  return (
    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-black text-amber-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-amber-600 shadow-sm">
            !
          </span>
          <span>고객이슈 요약</span>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-amber-700 ring-1 ring-amber-100">
          확인필요
        </span>
      </div>

      <p className="text-[11px] font-bold leading-5 text-amber-800">
        미해결 · 환불 · 교환 · 기타 문의는 고객관리에서 확인합니다.
      </p>

      <button
        type="button"
        onClick={onOpenCustomers}
        className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-[11px] font-black text-amber-800 ring-1 ring-amber-100 transition hover:bg-amber-100"
      >
        고객관리로 이동
      </button>
    </div>
  );
}
