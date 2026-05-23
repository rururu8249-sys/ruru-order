"use client";

import type { LiveOrder, LiveOrderItem } from "./types";

type Props = {
  order: LiveOrder;
  onOpenManualMatch?: (order: LiveOrder) => void;
  onClose?: () => void;
};

function money(value: unknown) {
  return `₩${Number(value || 0).toLocaleString()}`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function getItemName(item: LiveOrderItem) {
  return clean(item.productName) || "상품명 없음";
}

function getItemOption(item: LiveOrderItem) {
  return clean(item.optionText) || "옵션 없음";
}

function formatFullDateTime(value: string | null | undefined, fallback?: string | null) {
  if (!value) return fallback || "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback || value || "-";

  const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}.${mm}.${dd} ${weekdays[date.getDay()]} ${hh}:${mi}`;
}

function getPaymentStatusLabel(order: LiveOrder) {
  if (order.paymentStatus === "manual_match_needed") return "수동매칭 필요";
  if (order.paymentStatus === "manual_paid") return "수동입금확인";
  if (order.paymentStatus === "auto_paid") return "자동입금확인";
  if (order.paymentStatus === "card_paid") return "카드결제완료";
  if (order.paymentStatus === "card_unpaid") return "카드미결제";
  if (order.paymentStatus === "unpaid") return "미입금";
  return "입금확인";
}

function getPaymentStatusClass(order: LiveOrder) {
  if (order.paymentStatus === "manual_match_needed") return "border-orange-200 bg-orange-50 text-orange-700";
  if (["manual_paid", "auto_paid", "card_paid", "paid"].includes(order.paymentStatus)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["unpaid", "card_unpaid"].includes(order.paymentStatus)) return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function LiveOrderDetailDrawer({ order, onOpenManualMatch, onClose }: Props) {
  const items = Array.isArray(order.items) ? order.items : [];
  const productAmount = Number(order.productAmount || 0);
  const shippingFee = Number(order.shippingFee || 0);
  const totalAmount = Number(order.totalAmount || productAmount + shippingFee);

  return (
    <aside className="fixed bottom-5 right-5 top-[118px] z-40 flex w-[390px] max-w-[calc(100vw-24px)] flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl">
      <header className="shrink-0 border-b border-slate-100 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black tracking-[0.18em] text-blue-500">ORDER DETAIL</div>
            <h2 className="mt-0.5 text-xl font-black tracking-[-0.04em] text-slate-950">주문 상세</h2>
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose?.();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-xl font-black text-slate-400 hover:bg-slate-100 hover:text-slate-800"
            aria-label="주문상세 닫기"
          >
            ×
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <Info label="닉네임" value={order.nickname || "-"} strong />
            <Info label="이름" value={order.name || "-"} />
            <Info label="연락처" value={order.phone || "-"} />
            <Info label="주문번호" value={order.orderNo || "-"} />
            <Info label="제출시간" value={formatFullDateTime(order.createdAt, order.submittedAt)} />
            <Info label="입금시간" value={formatFullDateTime(order.paidAtFull, order.paidAt || "-")} />
            <Info label="결제방법" value={order.paymentMethod || "-"} />
          </div>

          <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-black ${getPaymentStatusClass(order)}`}>
            {getPaymentStatusLabel(order)}
          </div>
        </section>

        {order.paymentStatus === "manual_match_needed" && (
          <button
            type="button"
            onClick={() => onOpenManualMatch?.(order)}
            className="mt-3 h-12 w-full rounded-2xl bg-orange-500 text-sm font-black text-white shadow-sm hover:bg-orange-600 active:scale-[0.99]"
          >
            입금매칭 열기
          </button>
        )}

        <section className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-950">주문내역 ({items.length}건)</h3>
            <span className="text-xs font-black text-slate-400">수량 / 금액</span>
          </div>

          <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs font-bold text-slate-400">
                주문 품목이 없습니다.
              </div>
            ) : (
              items.map((item, index) => (
                <div key={`${item.id}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black leading-5 text-slate-950">
                        {getItemName(item)}
                      </div>
                      <div className="mt-1 whitespace-pre-line text-xs font-bold leading-5 text-slate-500">
                        {getItemOption(item)}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black text-slate-950">{Number(item.qty || 1)}개</div>
                      <div className="mt-1 text-sm font-black text-slate-950">{money(item.amount)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <PriceRow label="상품금액" value={productAmount} />
          <PriceRow label="배송비" value={shippingFee} />
          <div className="my-2 h-px bg-slate-100" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-slate-600">총 결제예정금액</span>
            <span className="text-2xl font-black tracking-[-0.05em] text-orange-600">{money(totalAmount)}</span>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-black text-slate-950">배송메모 / 특이사항</h3>
          <div className="min-h-[74px] rounded-2xl bg-slate-50 p-3 text-sm font-bold leading-6 text-slate-600">
            {order.memo || "-"}
          </div>
        </section>
      </div>
    </aside>
  );
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-black text-slate-400">{label}</div>
      <div className={["mt-0.5 truncate text-sm font-black", strong ? "text-blue-700" : "text-slate-900"].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm font-black text-slate-500">{label}</span>
      <span className="text-base font-black text-slate-950">{money(value)}</span>
    </div>
  );
}
