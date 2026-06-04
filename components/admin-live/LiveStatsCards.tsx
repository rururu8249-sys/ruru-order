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
    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-rose-line bg-white px-4 py-2.5 text-sm shadow-sm">
      <span className="font-black text-slate-950">매출 <b className="text-rose-deep">{money(paidAmount)}</b></span>
      <span className="text-slate-300">|</span>
      <span className="text-slate-600">무통장 미입금 <b className="text-amber-500">{money(bankUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</b></span>
      <span className="text-slate-300">|</span>
      <span className="text-slate-600">카드 미결제 <b className="text-amber-500">{money(cardUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</b></span>
      <span className="text-slate-300">|</span>
      <span className="text-slate-600">전체 미입금 <b className="text-red-600">{money((bankUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))+(cardUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0)))}</b></span>
    </div>
  );
}
