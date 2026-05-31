// components/myorder/MyOrderResultCard.tsx
// 목적: 고객 주문조회 결과 카드 UI
// 주의: UI 전용. 주문조회 Supabase 로직, 상태 저장 로직 없음.

import { formatMyOrderDateTime } from "@/components/myorder/myOrderDateFormat";

type MyOrderResultCardProps = {
  order: any;
  label: string;
  statusClassName: string;
  optionText: string;
  formattedDate: string;
  amountText: string;
};

const toMoneyNumber = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

const pointWon = (value: unknown) => `${toMoneyNumber(value).toLocaleString("ko-KR")}원`;

export default function MyOrderResultCard({
  order,
  label,
  statusClassName,
  optionText,
  formattedDate,
  amountText,
}: MyOrderResultCardProps) {
  const orderCode =
    order.order_lookup_code ||
    order.order_group_id ||
    String(order.id || "").slice(0, 12) ||
    "-";

  const paymentLabel = String(order.payment_method || "").includes("카드")
    ? "카드결제"
    : "무통장입금";

  const displayDate = formatMyOrderDateTime(
    order.created_at ||
      order.order_created_at ||
      order.submitted_at ||
      order.createdAt ||
      formattedDate
  );

  const paidLabels = [
    "입금확인완료",
    "입금확인",
    "자동입금확인",
    "수동입금확인",
    "확인완료",
    "배송출발",
    "출고준비중",
    "출고완료",
    "결제완료",
    "카드결제완료",
  ];

  const paymentStatus =
    label === "주문취소" || label === "주문서 취소" || label === "환불완료"
      ? label
      : paidLabels.includes(label)
        ? "입금확인"
        : "입금대기";

  const deliveryStatus =
    label === "배송출발" || label === "출고완료"
      ? "출고완료"
      : label === "출고준비중" || label === "확인완료"
        ? "출고준비"
        : label === "주문취소" || label === "주문서 취소" || label === "환불완료"
          ? label
          : "확인중";

  const showBandTrackingNotice = deliveryStatus === "출고완료";

  const pointUsedAmount = toMoneyNumber(order.point_used_amount ?? order.pointUsedAmount);
  const finalPaymentAmount = toMoneyNumber(
    order.final_amount ??
      order.finalAmount ??
      order.adjusted_total_price ??
      order.adjustedTotalPrice ??
      order.total_price ??
      order.totalPrice
  );
  const pointOriginalAmount = toMoneyNumber(
    order.point_original_amount ??
      order.pointOriginalAmount ??
      (pointUsedAmount > 0 ? finalPaymentAmount + pointUsedAmount : finalPaymentAmount)
  );

  const productName = String(order.product_name || "주문상품").trim();
  const quantityText = `${order.qty || 1}개`;
  const optionAndQuantity = optionText ? `${optionText} · ${quantityText}` : quantityText;

  const statusChipClass =
    deliveryStatus === "출고완료"
      ? "bg-blue-600 text-white"
      : paymentStatus === "입금확인"
        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
        : paymentStatus === "입금대기"
          ? "bg-orange-50 text-orange-700 ring-1 ring-orange-100"
          : statusClassName;

  void statusClassName;

  return (
    <article
      data-ruru-myorder-result-card="shell-v2"
      className="rounded-[20px] bg-white p-3 ring-1 ring-slate-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black tracking-[-0.04em] text-slate-600">
              {paymentLabel}
            </span>
            <span className={`rounded-full px-2 py-1 text-[11px] font-black tracking-[-0.04em] ${statusChipClass}`}>
              {deliveryStatus === "출고완료" ? "출고완료" : paymentStatus}
            </span>
          </div>

          <h3 className="mt-2 break-keep text-[16px] font-black leading-snug tracking-[-0.06em] text-slate-950">
            {productName}
          </h3>

          <p className="mt-1 truncate text-[12px] font-bold tracking-[-0.04em] text-slate-500" title={optionAndQuantity}>
            {optionAndQuantity}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[11px] font-bold tracking-[-0.04em] text-slate-400">
            결제금액
          </p>
          <p className="mt-1 text-[18px] font-black tracking-[-0.06em] text-slate-950">
            {amountText}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-[16px] bg-slate-50 px-3 py-2 text-[12px] font-bold tracking-[-0.04em] text-slate-600 ring-1 ring-slate-100">
        <div className="min-w-0">
          <p className="text-slate-400">주문번호</p>
          <p className="mt-0.5 truncate font-black text-slate-800" title={orderCode}>
            {orderCode}
          </p>
        </div>

        <div className="min-w-0 text-right">
          <p className="text-slate-400">주문일</p>
          <p className="mt-0.5 truncate font-black text-slate-800">
            {displayDate}
          </p>
        </div>
      </div>

      {pointUsedAmount > 0 ? (
        <div className="mt-2 rounded-[16px] bg-emerald-50 px-3 py-2 text-[12px] font-black leading-relaxed tracking-[-0.04em] text-emerald-800 ring-1 ring-emerald-100">
          <div className="flex items-center justify-between gap-3">
            <span>상품금액</span>
            <span>{pointWon(pointOriginalAmount)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3 text-emerald-700">
            <span>포인트 사용</span>
            <span>-{pointWon(pointUsedAmount)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-emerald-100 pt-1 text-orange-700">
            <span>최종 결제금액</span>
            <span>{pointWon(finalPaymentAmount)}</span>
          </div>
        </div>
      ) : null}

      {showBandTrackingNotice ? (
        <div className="mt-2 rounded-[16px] bg-blue-50 p-3 ring-1 ring-blue-100">
          <p className="break-keep text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
            출고완료 후 당일 늦은 오후~저녁 사이 밴드에서 송장조회가 가능합니다.
          </p>
          <a
            href="https://band.us/@ruru8249"
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex min-h-[38px] items-center justify-center rounded-[14px] bg-white px-3 py-2 text-[12px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100 transition active:scale-[0.98]"
          >
            밴드에서 송장조회
          </a>
        </div>
      ) : null}

      {order.cancel_reason ? (
        <div className="mt-2 rounded-[16px] bg-red-50 p-3 text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-red-600 ring-1 ring-red-100">
          취소 사유: {order.cancel_reason}
        </div>
      ) : null}
    </article>
  );
}
