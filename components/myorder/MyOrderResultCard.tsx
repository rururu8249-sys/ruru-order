// components/myorder/MyOrderResultCard.tsx
// 목적: 고객 주문조회 결과 카드 UI
// 주의: UI 전용. 주문조회 Supabase 로직, 상태 계산 로직 없음.

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
    label === "배송출발"
      ? "출고완료"
      : label === "출고준비중" || label === "확인완료"
        ? "출고준비"
        : label === "주문취소" || label === "환불완료"
          ? label
          : "확인중";

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

  return (
    <article className="rounded-[26px] bg-white p-4 shadow-[0_12px_28px_rgba(30,64,175,0.08)] ring-1 ring-blue-100 min-[390px]:rounded-[28px] min-[390px]:p-5">
      <div className="flex items-start gap-3 min-[390px]:gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-blue-50 text-[24px] ring-1 ring-blue-100 min-[390px]:h-16 min-[390px]:w-16 min-[390px]:rounded-[22px] min-[390px]:text-[31px]">
          🛍️
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid gap-2 text-[13px] font-bold text-slate-600 min-[390px]:text-[14px]">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 font-black text-[#151923]">주문번호</span>
              <span className="min-w-0 truncate text-right font-black text-[#151923]" title={orderCode}>
                {orderCode}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 font-black text-[#151923]">주문일</span>
              <span className="text-right">{displayDate}</span>
            </div>

            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 font-black text-[#151923]">상품명</span>
              <span className="break-keep text-right font-black text-[#151923]">
                {order.product_name || "주문상품"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 font-black text-[#151923]">수량/옵션</span>
              <span className="text-right">
                {optionText || "옵션 없음"} · {order.qty || 1}개
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 font-black text-[#151923]">결제방식</span>
              <span className="text-right font-black text-blue-600">{paymentLabel}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
            <div className="rounded-2xl bg-blue-50 px-3 py-2 text-center ring-1 ring-blue-100">
              <div className="text-[11px] font-black text-slate-500">입금상태</div>
              <div className="mt-1 text-[13px] font-black text-blue-700">{paymentStatus}</div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-center ring-1 ring-slate-100">
              <div className="text-[11px] font-black text-slate-500">배송상태</div>
              <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[12px] font-black ${statusClassName}`}>
                {deliveryStatus}
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-bold text-slate-500">
                {pointUsedAmount > 0 ? "최종 결제금액" : "주문금액"}
              </span>
              <span className="shrink-0 text-[20px] font-black tracking-[-0.045em] text-[#151923] min-[390px]:text-[22px]">
                {amountText}
              </span>
            </div>

            {pointUsedAmount > 0 ? (
              <div className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-[12px] font-black leading-relaxed text-emerald-800 ring-1 ring-emerald-100">
                <div className="flex items-center justify-between gap-3">
                  <span>상품금액</span>
                  <span>{pointWon(pointOriginalAmount)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-emerald-700">
                  <span>포인트 사용</span>
                  <span>-{pointWon(pointUsedAmount)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-emerald-100 pt-1 text-orange-700">
                  <span>최종 결제금액</span>
                  <span>{pointWon(finalPaymentAmount)}</span>
                </div>
              </div>
            ) : null}
          </div>

          {order.cancel_reason && (
            <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-600 ring-1 ring-red-100">
              취소 사유: {order.cancel_reason}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
