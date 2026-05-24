// components/myorder/MyOrderResultCard.tsx
// 목적: 고객 주문조회 결과 카드 UI
// 주의: UI 전용. 주문조회 Supabase 로직, 상태 계산 로직 없음.

type MyOrderResultCardProps = {
  order: any;
  label: string;
  statusClassName: string;
  optionText: string;
  formattedDate: string;
  amountText: string;
};

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

  return (
    <article className="rounded-[28px] bg-white p-5 shadow-[0_12px_28px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-blue-50 text-[31px] ring-1 ring-blue-100">
          🛍️
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid gap-2 text-[14px] font-bold text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 font-black text-[#151923]">주문번호</span>
              <span className="truncate text-right font-black text-[#151923]" title={orderCode}>
                {orderCode}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 font-black text-[#151923]">주문일</span>
              <span className="text-right">{formattedDate}</span>
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

          <div className="mt-4 grid grid-cols-2 gap-2">
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

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-[14px] font-bold text-slate-500">주문금액</span>
            <span className="text-[22px] font-black tracking-[-0.05em] text-[#151923]">
              {amountText}
            </span>
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
