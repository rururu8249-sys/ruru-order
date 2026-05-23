import type { LiveOrder } from "./types";

type Props = {
  orders: LiveOrder[];
};

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function getTotalQty(order: LiveOrder) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function getOrderSummary(order: LiveOrder) {
  const items = order.items || [];

  if (!items.length) {
    return order.orderSummary || "-";
  }

  const first = items[0];
  const name = first.productName || "-";
  const option = first.optionText ? `(${first.optionText})` : "";
  const qty = Number(first.qty || 0);

  if (items.length === 1) {
    return `${name}${option} x${qty}개`;
  }

  return `${name}${option} x${qty}개 외 ${items.length - 1}건`;
}

function statusBadge(order: LiveOrder) {
  if (order.paymentStatus === "manual_match_needed") {
    return <span className="rounded-lg bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">입금확인 필요</span>;
  }

  if (order.paymentStatus === "card_unpaid") {
    return <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-700">카드 미결제</span>;
  }

  if (order.paymentStatus === "unpaid") {
    return <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-700">미입금</span>;
  }

  if (order.paymentStatus === "card_paid") {
    return <span className="rounded-lg bg-violet-100 px-2 py-1 text-xs font-black text-violet-700">카드결제완료</span>;
  }

  if (order.paymentStatus === "auto_paid") {
    return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">자동입금확인</span>;
  }

  if (order.paymentStatus === "manual_paid") {
    return <span className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">수동입금확인</span>;
  }

  return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">입금확인</span>;
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-bold text-slate-400">{sub}</div>
    </div>
  );
}

export default function AdminLiveOrdersPanel({ orders }: Props) {
  const paidOrders = orders.filter((order) =>
    ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus)
  );
  const unpaidOrders = orders.filter((order) =>
    ["unpaid", "manual_match_needed", "card_unpaid"].includes(order.paymentStatus)
  );
  const manualNeededOrders = orders.filter((order) => order.paymentStatus === "manual_match_needed");

  const totalAmount = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const paidAmount = paidOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const unpaidAmount = unpaidOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  const latestOrders = [...orders].slice(0, 20);

  return (
    <section className="grid gap-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">ORDER MANAGEMENT</div>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">주문관리</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              현재 연결은 읽기전용입니다. 주문 수정·상태 변경·입금확인 처리는 아직 실행하지 않습니다.
            </p>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            읽기전용 연결
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="전체 주문" value={`${orders.length.toLocaleString("ko-KR")}건`} sub={money(totalAmount)} />
          <SummaryCard label="입금확인 주문" value={`${paidOrders.length.toLocaleString("ko-KR")}건`} sub={money(paidAmount)} />
          <SummaryCard label="미입금 주문" value={`${unpaidOrders.length.toLocaleString("ko-KR")}건`} sub={money(unpaidAmount)} />
          <SummaryCard label="입금확인 필요" value={`${manualNeededOrders.length.toLocaleString("ko-KR")}건`} sub="수동 확인 대상" />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">최근 주문내역</h2>
          <div className="text-xs font-bold text-slate-400">최대 20건 표시</div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[130px_110px_110px_1fr_110px_110px] bg-slate-50 px-4 py-3 text-xs font-black text-slate-500">
            <div>상태</div>
            <div>닉네임</div>
            <div>이름</div>
            <div>주문상품</div>
            <div className="text-right">수량</div>
            <div className="text-right">결제금액</div>
          </div>

          {latestOrders.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm font-bold text-slate-400">
              표시할 주문내역이 없습니다.
            </div>
          ) : (
            latestOrders.map((order) => (
              <div
                key={order.id}
                className="grid grid-cols-[130px_110px_110px_1fr_110px_110px] items-center border-t border-slate-100 px-4 py-3 text-sm"
              >
                <div>{statusBadge(order)}</div>
                <div className="truncate font-black text-slate-900">{order.nickname || "-"}</div>
                <div className="truncate font-bold text-slate-600">{order.name || "-"}</div>
                <div className="truncate font-bold text-slate-700" title={order.orderSummary || getOrderSummary(order)}>
                  {getOrderSummary(order)}
                </div>
                <div className="text-right font-black text-slate-700">{getTotalQty(order).toLocaleString("ko-KR")}개</div>
                <div className="text-right font-black text-slate-900">{money(order.totalAmount)}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-700">
          다음 단계에서 검색, 기간필터, 상태필터, 상세보기, 일괄처리를 순서대로 연결합니다.
          현재 화면은 조회 전용이라 주문금액·입금상태·배송상태를 변경하지 않습니다.
        </div>
      </div>
    </section>
  );
}
