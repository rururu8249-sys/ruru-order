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
      color: "bg-ok-bg text-ok-tx",
    },
    {
      label: "미입금",
      amount: money(bankUnpaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `입금대기 ${bankUnpaid.length}건`,
      icon: "⏱",
      color: "bg-danger-bg text-danger-tx",
    },
    {
      label: "카드 결제완료",
      amount: money(cardPaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `결제완료 ${cardPaid.length}건`,
      icon: "💳",
      color: "bg-violet-50 text-violet-700",
    },
    {
      label: "카드미결제",
      amount: money(cardUnpaid.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)),
      sub: `카드미결제 ${cardUnpaid.length}건`,
      icon: "💳",
      color: "bg-danger-bg text-danger-tx",
    },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-rose-line bg-surface px-4 py-2.5 text-[12px] font-black">
      <span className="text-ink-soft">매출 <span className="text-ink text-[13px]">{money(paidAmount)}</span></span>
      <span className="text-line">|</span>
      <span className="text-ink-soft">무통장입금 <span className="text-ok-tx">{money(bankPaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-ink-soft">카드결제 <span className="text-ok-tx">{money(cardPaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-line">|</span>
      <span className="text-ink-soft">무통장미입금 <span className="text-warn-tx">{money(bankUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-ink-soft">카드미결제 <span className="text-warn-tx">{money(cardUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
      <span className="text-ink-soft">전체미입금 <span className="text-danger-tx">{money(bankUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0)+cardUnpaid.reduce((s,o)=>s+Number(o.totalAmount||0),0))}</span></span>
    </div>
  );
}
