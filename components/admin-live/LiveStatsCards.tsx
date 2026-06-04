import type { LiveOrder } from "./types";

type Props = {
  orders: LiveOrder[];
  criteriaLabel?: string;
};

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function isPaid(order: LiveOrder) {
  return ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus);
}

function isCanceled(order: LiveOrder) {
  return order.paymentStatus === "canceled";
}

export default function LiveStatsCards({ orders, criteriaLabel = "최근 주문 500건 전체" }: Props) {
  const settlementOrders = orders.filter((order) => order.excludeFromSettlement !== true);
  const totalOrderAmount = settlementOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const activeOrders = settlementOrders.filter((order) => !isCanceled(order));
  const paidOrders = activeOrders.filter(isPaid);
  const paidAmount = paidOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  const bankPaid = activeOrders.filter((order) =>
    order.paymentMethod === "무통장입금" && ["paid", "auto_paid", "manual_paid"].includes(order.paymentStatus)
  );
  const bankUnpaid = activeOrders.filter((order) =>
    order.paymentMethod === "무통장입금" && ["unpaid", "manual_match_needed"].includes(order.paymentStatus)
  );
  const cardPaid = activeOrders.filter((order) => order.paymentMethod === "카드결제" && order.paymentStatus === "card_paid");
  const cardUnpaid = activeOrders.filter((order) => order.paymentMethod === "카드결제" && order.paymentStatus === "card_unpaid");

  const stats = [
    {
      label: "결제완료 매출",
      amount: money(paidAmount),
      sub: `결제완료 ${paidOrders.length}건 · 전체 ${settlementOrders.length}건`,
      icon: "📈",
      color: "bg-rose-soft text-rose-deep",
    },
    {
      label: "무통장 결제완료",
      amount: money(bankPaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `결제완료 ${bankPaid.length}건`,
      icon: "🏦",
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "미입금",
      amount: money(bankUnpaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `입금대기 ${bankUnpaid.length}건`,
      icon: "⏱",
      color: "bg-red-50 text-red-700",
    },
    {
      label: "카드 결제완료",
      amount: money(cardPaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `결제완료 ${cardPaid.length}건`,
      icon: "💳",
      color: "bg-violet-50 text-violet-700",
    },
    {
      label: "카드 미결제",
      amount: money(cardUnpaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `카드 미결제 ${cardUnpaid.length}건`,
      icon: "💳",
      color: "bg-red-50 text-red-700",
    },
  ];

  return (
    <section className="mb-3">
<div className="grid w-full grid-cols-5 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 rounded-2xl border border-rose-line bg-white px-3 py-2.5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-base ${stat.color}`}>
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
