"use client";

import type { LiveOrder } from "./types";

function money(value: number) {
  return `₩${value.toLocaleString("ko-KR")}`;
}

type Props = {
  order: LiveOrder;
  onOpenManualMatch?: (order: LiveOrder) => void;
};

export default function LiveOrderDetailDrawer({ order, onOpenManualMatch }: Props) {
  const totalAmount = order.totalAmount || order.productAmount + order.shippingFee;

  return (
    <aside className="sticky top-4 flex max-h-[calc(100vh-32px)] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex shrink-0 items-center">
        <h2 className="text-lg font-black text-slate-950">주문 상세</h2>
        <button className="ml-auto text-xl text-slate-400 hover:text-slate-800">×</button>
      </div>

      <div className="min-h-0 overflow-y-auto pr-1">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Info label="닉네임" value={order.nickname} blue />
            <Info label="이름" value={order.name} />
            <Info label="연락처" value={order.phone} />
            <Info label="주문번호" value={order.orderNo} />
            <Info label="제출시간" value={`2026.05.23 ${order.submittedAt}`} />
            <Info label="결제방법" value={order.paymentMethod} />
          </div>
        </div>

        {order.paymentStatus === "manual_match_needed" && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => onOpenManualMatch?.(order)}
              className="w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-orange-600"
            >
              입금매칭 열기
            </button>
          </div>
        )}

        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">주문내역 ({order.items.length}건)</h3>
            <span className="text-xs font-black text-slate-400">수량 / 금액</span>
          </div>

          <div className="max-h-[180px] overflow-y-auto rounded-xl border border-slate-200">
            {order.items.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_34px_78px] gap-2 border-b border-slate-100 bg-white px-3 py-2 text-xs last:border-b-0">
                <div>
                  <div className="font-black text-slate-800">{item.productName}</div>
                  <div className="mt-1 font-bold text-slate-500">{item.optionText}</div>
                </div>
                <div className="text-center font-black text-slate-700">{item.qty}</div>
                <div className="text-right font-black text-slate-800">{money(item.amount)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="space-y-2 text-sm">
            <PriceRow label="상품금액" value={money(order.productAmount)} />
            <PriceRow label="배송비" value={money(order.shippingFee)} />
            <div className="border-t border-slate-100 pt-2">
              <PriceRow label="총 결제예정금액" value={money(totalAmount)} strong />
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="mb-2 text-sm font-black text-slate-900">배송메모 / 특이사항</div>
          <p className="min-h-[46px] rounded-xl bg-slate-50 p-2.5 text-sm font-bold leading-5 text-slate-600">
            {order.memo || "등록된 메모가 없습니다."}
          </p>
        </div>

      </div>
    </aside>
  );
}

function Info({ label, value, blue = false }: { label: string; value: string; blue?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-black text-slate-400">{label}</div>
      <div className={["mt-1 truncate font-black", blue ? "text-blue-700" : "text-slate-800"].join(" ")}>{value}</div>
    </div>
  );
}

function PriceRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-black text-slate-500">{label}</span>
      <span className={strong ? "text-lg font-black text-orange-600" : "font-black text-slate-800"}>{value}</span>
    </div>
  );
}
