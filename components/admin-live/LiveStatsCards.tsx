import type { LiveOrder } from "./types";

type Props = {
  orders: LiveOrder[];
  criteriaLabel?: string;
};

function money(value: number) {
  return `₩${Number(value || 0).toLocaleString("ko-KR")}`;
}

function isPaid(order: LiveOrder) {
  return ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus);
}

export default function LiveStatsCards({ orders, criteriaLabel = "최근 주문 500건 전체" }: Props) {
  const totalAmount = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  const bankPaid = orders.filter((order) => order.paymentMethod === "무통장입금" && isPaid(order));
  const bankUnpaid = orders.filter((order) => order.paymentMethod === "무통장입금" && !isPaid(order));
  const cardPaid = orders.filter((order) => order.paymentMethod === "카드결제" && isPaid(order));
  const cardUnpaid = orders.filter((order) => order.paymentMethod === "카드결제" && !isPaid(order));

  const stats = [
    {
      label: "총매출 (미입금포함)",
      amount: money(totalAmount),
      sub: `주문 ${orders.length}건`,
      icon: "📈",
      color: "bg-violet-50 text-violet-700",
    },
    {
      label: "무통장입금",
      amount: money(bankPaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `입금완료 ${bankPaid.length}건`,
      icon: "🏦",
      color: "bg-orange-50 text-orange-700",
    },
    {
      label: "무통장미입금",
      amount: money(bankUnpaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `미입금 ${bankUnpaid.length}건`,
      icon: "⏱",
      color: "bg-amber-50 text-amber-700",
    },
    {
      label: "카드결제완료",
      amount: money(cardPaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `결제완료 ${cardPaid.length}건`,
      icon: "💳",
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "카드미결제",
      amount: money(cardUnpaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `미결제 ${cardUnpaid.length}건`,
      icon: "💳",
      color: "bg-blue-50 text-blue-700",
    },
  ];

  return (
    <section className="mb-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-black text-slate-500">
          매출 요약
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500">
          집계기준: {criteriaLabel}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${stat.color}`}>
                {stat.icon}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-black text-slate-500">{stat.label}</div>
                <div className="text-[17px] font-black tracking-tight text-slate-950">{stat.amount}</div>
                <div className="mt-0.5 text-[11px] font-bold text-slate-400">{stat.sub}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
