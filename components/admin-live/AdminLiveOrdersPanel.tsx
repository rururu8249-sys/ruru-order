import LiveOrderDetailDrawer from "./LiveOrderDetailDrawer";
import LiveOrderTable, { type LiveOrderFilters } from "./LiveOrderTable";
import type { LiveOrder } from "./types";

type BroadcastOption = {
  value: string;
  label: string;
};

type Props = {
  orders: LiveOrder[];
  allOrderCount: number;
  selectedOrder: LiveOrder | null;
  selectedOrderId: string;
  orderDetailOpen: boolean;
  filters: LiveOrderFilters;
  broadcastOptions: BroadcastOption[];
  loading?: boolean;
  onSelectOrder: (order: LiveOrder) => void;
  onCloseOrderDetail: () => void;
  onFiltersChange: (filters: LiveOrderFilters) => void;
  onRefresh: () => void | Promise<void>;
};

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
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

export default function AdminLiveOrdersPanel({
  orders,
  allOrderCount,
  selectedOrder,
  selectedOrderId,
  orderDetailOpen,
  filters,
  broadcastOptions,
  loading = false,
  onSelectOrder,
  onCloseOrderDetail,
  onFiltersChange,
  onRefresh,
}: Props) {
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

  return (
    <section className="grid gap-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">ORDER MANAGEMENT</div>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">주문관리</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              주문표·검색·필터·정렬·상세보기까지 연결했습니다. 주문 수정·상태 변경·입금확인 처리는 아직 실행하지 않습니다.
            </p>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            조회/상세 연결
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="현재 표시 주문" value={`${orders.length.toLocaleString("ko-KR")}건`} sub={money(totalAmount)} />
          <SummaryCard label="입금확인 주문" value={`${paidOrders.length.toLocaleString("ko-KR")}건`} sub={money(paidAmount)} />
          <SummaryCard label="미입금 주문" value={`${unpaidOrders.length.toLocaleString("ko-KR")}건`} sub={money(unpaidAmount)} />
          <SummaryCard label="입금확인 필요" value={`${manualNeededOrders.length.toLocaleString("ko-KR")}건`} sub="수동 확인은 아직 주문관리에서 실행하지 않음" />
        </div>
      </div>

      <LiveOrderTable
        orders={orders}
        allOrderCount={allOrderCount}
        selectedOrderId={selectedOrderId}
        onSelectOrder={onSelectOrder}
        onRefresh={onRefresh}
        loading={loading}
        filters={filters}
        onFiltersChange={onFiltersChange}
        broadcastOptions={broadcastOptions}
      />

      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-700">
        현재 주문관리 메뉴는 조회/검색/필터/상세보기 전용입니다. 입금확인 필요 주문의 수동매칭은 아직 방송 화면에서만 처리합니다.
      </div>

      {orderDetailOpen && selectedOrder ? (
        <LiveOrderDetailDrawer order={selectedOrder} onClose={onCloseOrderDetail} onAfterStatusChange={onRefresh} />
      ) : null}
    </section>
  );
}
