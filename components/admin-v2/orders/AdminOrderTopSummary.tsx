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

function numberValue(value: unknown) {
  return Number(value || 0);
}

function MiniSummary({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        strong
          ? "border-neutral-900 bg-neutral-950 text-white"
          : "border-neutral-200 bg-white text-neutral-900"
      }`}
    >
      <div className={`text-[11px] font-bold ${strong ? "text-neutral-300" : "text-neutral-500"}`}>
        {label}
      </div>
      <div className="mt-0.5 text-[17px] font-black">{value}</div>
    </div>
  );
}

export default function AdminOrderTopSummary({ summaryCards }: AdminOrderTopSummaryProps) {
  const totalOrders = numberValue(summaryCards.totalOrderCount);
  const totalQty = numberValue(summaryCards.totalOrderProductQty);
  const unpaidCount = numberValue(summaryCards.bankUnpaid) + numberValue(summaryCards.cardUnpaid);
  const paidCount = numberValue(summaryCards.bankPaid) + numberValue(summaryCards.cardPaid);

  return (
    <section className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      <MiniSummary label="전체" value={`${totalOrders.toLocaleString()}건`} />
      <MiniSummary label="미입금" value={`${unpaidCount.toLocaleString()}건`} strong={unpaidCount > 0} />
      <MiniSummary label="결제완료" value={`${paidCount.toLocaleString()}건`} />
      <MiniSummary label="총수량" value={`${totalQty.toLocaleString()}개`} />
    </section>
  );
}
