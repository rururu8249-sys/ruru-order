"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LiveOrder, LiveOrderItem } from "./types";
import { isLiveOrderCanceled, useLiveOrderCancelRestore } from "./useLiveOrderCancelRestore";
import LiveOrderItemEditCard from "./LiveOrderItemEditCard";
import type { LiveOrderItemEditSaveResult } from "./useLiveOrderItemEdit";
import LiveOrderDangerActionGuide from "./LiveOrderDangerActionGuide";

type Props = {
  order: LiveOrder;
  onOpenManualMatch?: (order: LiveOrder) => void;
  onClose?: () => void;
  onAfterStatusChange?: () => void | Promise<void>;
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
  if (order.paymentStatus === "canceled") return "주문서취소";
  if (order.paymentStatus === "manual_match_needed") return "입금확인 필요";
  if (order.paymentStatus === "manual_paid") return "수동입금확인";
  if (order.paymentStatus === "auto_paid") return "자동입금확인";
  if (order.paymentStatus === "card_paid") return "카드결제완료";
  if (order.paymentStatus === "card_unpaid") return "카드 미결제";
  if (order.paymentStatus === "unpaid") return "미입금";
  return "입금확인";
}

function getPaymentStatusClass(order: LiveOrder) {
  if (order.paymentStatus === "canceled") return "border-red-200 bg-red-50 text-red-700";
  if (order.paymentStatus === "manual_match_needed") return "border-orange-200 bg-orange-50 text-orange-700";
  if (order.paymentStatus === "manual_paid") return "border-blue-200 bg-blue-50 text-blue-700";
  if (["auto_paid", "paid"].includes(order.paymentStatus)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (order.paymentStatus === "card_paid") return "border-violet-200 bg-violet-50 text-violet-700";
  if (["unpaid", "card_unpaid"].includes(order.paymentStatus)) return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function LiveOrderDetailDrawer({ order, onOpenManualMatch, onClose, onAfterStatusChange }: Props) {
  const [cardStatusAction, setCardStatusAction] = useState<"" | "card-paid" | "card-unpaid">("");
  const [paymentCancelAction, setPaymentCancelAction] = useState(false);
  const [paymentCancelError, setPaymentCancelError] = useState("");

  const [localOrder, setLocalOrder] = useState(order);
  const [refreshingDetail, setRefreshingDetail] = useState(false);

  useEffect(() => {
    setLocalOrder(order);
  }, [order]);

  const handleItemSaved = async (result: LiveOrderItemEditSaveResult) => {
    setRefreshingDetail(true);

    try {
      setLocalOrder((previousOrder) => {
        const previousItems = Array.isArray(previousOrder.items) ? previousOrder.items : [];
        const nextItems = previousItems.map((item) => {
          if (String(item.id) !== String(result.rowId)) return item;

          return {
            ...item,
            productName: result.productName,
            color: result.color,
            size: result.size,
            optionText: [result.color, result.size].filter(Boolean).join(" / ") || "옵션 없음",
            qty: result.qty,
            unitPrice: result.unitPrice,
            amount: result.productTotal,
            productEditCount: Number(item.productEditCount || 0) + (result.productChanged ? 1 : 0),
            amountEditCount: Number(item.amountEditCount || 0) + (result.amountChanged ? 1 : 0),
          };
        });

        const nextTotalQty = nextItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
        const nextProductAmount = nextItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const nextTotalAmount = nextProductAmount + Number(previousOrder.shippingFee || 0);

        return {
          ...previousOrder,
          items: nextItems,
          totalQty: nextTotalQty,
          totalAmount: nextTotalAmount,
          itemSummary: nextItems
            .map((item) => [item.productName, item.color, item.size].filter(Boolean).join(" / "))
            .filter(Boolean)
            .join(" | "),
        };
      });

      await onAfterStatusChange?.();
    } finally {
      setRefreshingDetail(false);
    }
  };

  const orderForView = localOrder;
  const items = Array.isArray(orderForView.items) ? orderForView.items : [];
  const isCanceled = isLiveOrderCanceled(orderForView);
  const productAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const shippingFee = Number(orderForView.shippingFee || 0);
  const totalAmount = productAmount + shippingFee;
  const isCardOrder = String(orderForView.paymentMethod || "").includes("카드");
  const isCardPaid = orderForView.paymentStatus === "card_paid";
  const isCardUnpaid = orderForView.paymentStatus === "card_unpaid";

  const canCancelPaymentConfirm =
    ["paid", "auto_paid", "manual_paid"].includes(orderForView.paymentStatus) ||
    (orderForView.paymentStatus === "canceled" && Boolean(orderForView.paidAtFull));

  const showCardStatusActions = !isCanceled && isCardOrder && (isCardPaid || isCardUnpaid);

  const { savingAction, cancelOrder, restoreOrder } = useLiveOrderCancelRestore({
    order: orderForView,
    onAfterStatusChange,
    onClose,
  });

  const handlePaymentConfirmCancel = async () => {
    if (!canCancelPaymentConfirm || paymentCancelAction) return;

    setPaymentCancelAction(true);
    setPaymentCancelError("");

    try {
      const currentOrder = orderForView as any;

      const response = await fetch("/api/admin-v2/payment-confirm-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderGroupId:
            currentOrder.groupId ||
            currentOrder.orderGroupId ||
            currentOrder.order_group_id ||
            "",
          orderLookupCode:
            currentOrder.orderNumber ||
            currentOrder.orderLookupCode ||
            currentOrder.order_lookup_code ||
            "",
          orderIds: currentOrder.orderIds || currentOrder.order_ids || [],
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setPaymentCancelError(result?.message || "입금확인 취소 실패");
        return;
      }

      window.location.reload();
    } catch (error) {
      setPaymentCancelError(error instanceof Error ? error.message : String(error));
    } finally {
      setPaymentCancelAction(false);
    }
  };

  const handleCardPaymentStatusChange = async (
    nextStatus: "카드결제완료" | "주문확인전",
    action: "card-paid" | "card-unpaid"
  ) => {
    if (!isCardOrder) {
      alert("카드결제 주문에서만 처리할 수 있습니다.");
      return;
    }

    const rowIds = items
      .map((item) => Number(item.id))
      .filter((id) => Number.isFinite(id));

    if (rowIds.length === 0) {
      alert("상태 변경할 주문 ID가 없습니다.");
      return;
    }

    const confirmMessage =
      nextStatus === "카드결제완료"
        ? [
            "카드결제완료 처리할까요?",
            "",
            "실제 카드결제가 확인된 경우에만 진행하세요.",
            "주문상태만 카드결제완료로 변경합니다.",
          ].join("\n")
        : [
            "카드결제완료 상태를 카드미결제로 되돌릴까요?",
            "",
            "주문상태는 주문확인전으로 돌아갑니다.",
            "결제방식은 카드결제로 유지됩니다.",
            "금액/상품/배송/송장/자동입금 로직은 변경하지 않습니다.",
          ].join("\n");

    if (!window.confirm(confirmMessage)) return;

    setCardStatusAction(action);

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          admin_order_status_v2: nextStatus,
          order_manage_status: nextStatus,
        })
        .in("id", rowIds);

      if (error) {
        alert("카드결제 상태 변경 실패\n\n" + error.message);
        return;
      }

      alert(nextStatus === "카드결제완료" ? "카드결제완료 처리됐습니다." : "카드미결제로 되돌렸습니다.");

      await onAfterStatusChange?.();
      onClose?.();
    } finally {
      setCardStatusAction("");
    }
  };


  return (
    <aside className="fixed bottom-5 right-5 top-[118px] z-40 flex w-[520px] max-w-[calc(100vw-24px)] flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl">
      <header className="shrink-0 border-b border-slate-100 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black tracking-[0.18em] text-blue-500">ORDER DETAIL</div>
            <h2 className="mt-0.5 text-lg font-black tracking-[-0.04em] text-slate-950">주문 상세</h2>
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
            <Info label="닉네임" value={orderForView.nickname || "-"} strong />
            <Info label="이름" value={order.name || "-"} />
            <Info label="연락처" value={orderForView.phone || "-"} />
            <Info label="주문번호" value={order.orderNo || "-"} />
            <Info label="제출시간" value={formatFullDateTime(order.createdAt, orderForView.submittedAt)} />
            <Info label="입금시간" value={formatFullDateTime(orderForView.paidAtFull, orderForView.paidAt || "-")} />
            <Info label="결제방법" value={orderForView.paymentMethod || "-"} />
          </div>

          <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-black ${getPaymentStatusClass(orderForView)}`}>
            {getPaymentStatusLabel(orderForView)}
          </div>

          {["manual_paid", "auto_paid", "paid"].includes(orderForView.paymentStatus) ? (
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold leading-4 text-slate-500">
              입금확인된 주문입니다. 입금확인을 잘못 처리한 경우에는 [입금확인 취소]를 사용하세요. 주문 자체를 없애야 하는 경우에만 [주문서 자체 취소]를 사용하세요.
            </div>
          ) : null}

          {paymentCancelError ? (
            <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-black leading-4 text-red-700">
              입금확인 취소 오류: {paymentCancelError}
            </div>
          ) : null}
        </section>

        <div className="mt-3 grid grid-cols-1 gap-2">
          {!isCanceled && canCancelPaymentConfirm ? (
            <button
              type="button"
              onClick={handlePaymentConfirmCancel}
              disabled={paymentCancelAction}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white text-[13px] font-black text-slate-700 shadow-sm hover:bg-slate-50 active:scale-[0.99] disabled:bg-slate-100 disabled:text-slate-400"
            >
              {paymentCancelAction ? "처리중..." : "입금확인 취소"}
            </button>
          ) : null}

          {showCardStatusActions ? (
            <>
              {isCardUnpaid ? (
                <button
                  type="button"
                  onClick={() => handleCardPaymentStatusChange("카드결제완료", "card-paid")}
                  disabled={Boolean(cardStatusAction)}
                  className="h-10 w-full rounded-xl bg-violet-600 text-[13px] font-black text-white shadow-sm hover:bg-violet-700 active:scale-[0.99] disabled:bg-slate-300"
                >
                  {cardStatusAction === "card-paid" ? "처리중..." : "카드결제완료 처리"}
                </button>
              ) : null}

              {isCardPaid ? (
                <>
                  <div className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-[11px] font-bold leading-4 text-purple-700">
                    카드결제완료 주문입니다. 결제완료 처리를 잘못한 경우에는 [카드미결제로 되돌리기]를 사용하세요. 주문 자체를 없애야 하는 경우에만 [주문서 자체 취소]를 사용하세요.
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCardPaymentStatusChange("주문확인전", "card-unpaid")}
                    disabled={Boolean(cardStatusAction)}
                    className="h-10 w-full rounded-xl border border-rose-200 bg-rose-50 text-[13px] font-black text-rose-700 shadow-sm hover:bg-rose-100 active:scale-[0.99] disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {cardStatusAction === "card-unpaid" ? "처리중..." : "카드미결제로 되돌리기"}
                  </button>
                </>
              ) : null}
            </>
          ) : null}

          {!isCanceled && orderForView.paymentStatus === "manual_match_needed" && onOpenManualMatch ? (
            <button
              type="button"
              onClick={() => onOpenManualMatch(order)}
              className="h-10 w-full rounded-xl bg-orange-500 text-[13px] font-black text-white shadow-sm hover:bg-orange-600 active:scale-[0.99]"
            >
              입금확인 열기
            </button>
          ) : null}

          {isCanceled ? (
            <>
              <button
                type="button"
                onClick={restoreOrder}
                disabled={Boolean(savingAction)}
                className="h-10 w-full rounded-xl bg-blue-600 text-[13px] font-black text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] disabled:bg-slate-300"
              >
                {savingAction === "restore" ? "처리중..." : "주문서복구"}
              </button>

              {canCancelPaymentConfirm && !isCardOrder ? (
                <>
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-4 text-amber-800">
                    주문서는 이미 취소된 상태입니다. 다만 입금확인 기록이 남아있어 정산에서 제외하려면 [취소주문 입금기록 정리]를 사용하세요.
                  </div>
                  <button
                    type="button"
                    onClick={handlePaymentConfirmCancel}
                    disabled={paymentCancelAction}
                    className="h-10 w-full rounded-xl border border-amber-200 bg-white text-[13px] font-black text-amber-800 shadow-sm hover:bg-amber-50 active:scale-[0.99] disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {paymentCancelAction ? "처리중..." : "취소주문 입금기록 정리"}
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <>
              <LiveOrderDangerActionGuide />
              <button
                type="button"
                onClick={cancelOrder}
                disabled={Boolean(savingAction)}
                className="h-10 w-full rounded-xl border border-red-200 bg-red-50 text-[13px] font-black text-red-700 shadow-sm hover:bg-red-100 active:scale-[0.99] disabled:bg-slate-100 disabled:text-slate-400"
              >
                {savingAction === "cancel" ? "처리중..." : "주문서 자체 취소"}
              </button>
            </>
          )}
        </div>

        <section className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-950">주문내역 ({items.length}건)</h3>
            {refreshingDetail ? (
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700">
                상세정보 갱신중...
              </span>
            ) : null}
            <span className="text-xs font-black text-slate-400">수량 / 금액</span>
          </div>

          <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs font-bold text-slate-400">
                주문 품목이 없습니다.
              </div>
            ) : (
              items.map((item, index) => (
                <LiveOrderItemEditCard
                  key={`${item.id}-${index}`}
                  item={item}
                  index={index}
                  disabled={isCanceled}
                  onAfterSave={handleItemSaved}
                />
              ))
            )}
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <PriceRow label="상품금액" value={productAmount} />
          <PriceRow label="배송비" value={shippingFee} />
          <div className="my-2 h-px bg-slate-100" />
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-black text-slate-600">총 결제예정금액</span>
            <span className="text-2xl font-black tracking-[-0.05em] text-orange-600">{money(totalAmount)}</span>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-black text-slate-950">배송메모 / 특이사항</h3>
          <div className="min-h-[74px] rounded-2xl bg-slate-50 p-3 text-sm font-bold leading-6 text-slate-600">
            {orderForView.memo || "-"}
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
