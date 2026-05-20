"use client";

type AdminOrderTopSummaryProps = {
  summaryCards: {
    totalOrderProductQty: number;
    totalOrderCount: number;
    totalOrderAmount: number;
    bankPaid: number;
    bankUnpaid: number;
    cardPaid: number;
    cardUnpaid: number;
    canceledAmount: number;
  };
};

export default function AdminOrderTopSummary({ summaryCards }: AdminOrderTopSummaryProps) {
  const unpaidCount = Number(summaryCards.bankUnpaid || 0) + Number(summaryCards.cardUnpaid || 0);

  if (unpaidCount <= 0) return null;

  return (
    <div className="mb-3 inline-flex rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-black text-amber-800">
      미입금 {unpaidCount.toLocaleString()}건
    </div>
  );
}
