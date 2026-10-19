// components/myorder/MyOrderResultCard.tsx
// 목적: 고객 주문조회 결과 카드 UI
// 주의: UI 전용. 주문조회 Supabase 로직, 상태 저장 로직 없음.

"use client";

import { formatMyOrderDateTime } from "@/components/myorder/myOrderDateFormat";
import { useCustomerUiStage } from "@/lib/useCustomerUiStage";
import { myOrderChipView } from "@/lib/customerOrderStatusView";

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

// [㉜ 4단계] 상태 배지 색 — DESIGN.md §9(연한 바탕 + 진한 글자). 글자(라벨)는 그대로, 색만.
const statusChipClassV2 = (text: string) => {
  if (text === "출고완료" || text === "배송출발") return "bg-[#111111] text-white";
  if (text === "입금확인" || text === "입금확인완료") return "bg-[#E6F4EC] text-[#007D48]";
  if (text === "입금대기" || text === "주문접수" || text === "부분환불") return "bg-[#FFF4E0] text-[#9E5A00]";
  // [㊲ 2026-10-19 사장님] 주문취소는 회색 계열(빨강 아님) — 환불완료와 같은 회색
  return "bg-[#F5F5F5] text-[#39393B]"; // 주문취소·환불완료·출고준비중·픽업예정 등
};

export default function MyOrderResultCard({
  order,
  label,
  statusClassName,
  optionText,
  formattedDate,
  amountText,
}: MyOrderResultCardProps) {
  const v2 = useCustomerUiStage("s4"); // [㉜ 4단계] 표시 전용
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

  // [㊲] 결제·배송 상태 계산은 lib/customerOrderStatusView 로 옮김(내용 같음 + 「주문서취소」·부분환불 인식).
  //   예전엔 취소 글자가 "주문서취소"(띄어쓰기 없음)로 와서 「입금대기」로 보였다.
  const { paymentStatus, deliveryStatus } = myOrderChipView(label);

  // [송장 표시] DB에 관리자가 입력한 송장(tracking_number)이 있으면 앱에서 바로 조회 — 밴드 안내는 송장 미등록 시 폴백
  const trackingNumber = String(order.tracking_number || "").trim();
  const trackingCompany = String(order.tracking_company || "").trim();
  const trackingUrl = trackingNumber
    ? (!trackingCompany || trackingCompany.includes("로젠")
        ? `https://www.ilogen.com/web/personal/trace/${encodeURIComponent(trackingNumber)}`
        : `https://search.naver.com/search.naver?query=${encodeURIComponent(`${trackingCompany} ${trackingNumber}`)}`)
    : "";
  const showBandTrackingNotice = deliveryStatus === "출고완료" && !trackingNumber;

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
      className={v2 ? "border-b border-[#E5E5E5] bg-white py-4" : "rounded-[20px] bg-white p-3 ring-1 ring-slate-200"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={v2 ? "rounded-full border border-[#CACACB] bg-white px-2.5 py-1 text-[13px] font-semibold text-[#39393B]" : "rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black tracking-[-0.04em] text-slate-600"}>
              {paymentLabel}
            </span>
            <span className={v2 ? `rounded-full px-2.5 py-1 text-[13px] font-semibold ${statusChipClassV2(deliveryStatus === "출고완료" ? "출고완료" : paymentStatus)}` : `rounded-full px-2 py-1 text-[11px] font-black tracking-[-0.04em] ${statusChipClass}`}>
              {deliveryStatus === "출고완료" ? "출고완료" : paymentStatus}
            </span>
          </div>

          <h3 className={v2 ? "mt-2 break-keep text-[16px] font-semibold leading-snug text-[#111111]" : "mt-2 break-keep text-[16px] font-black leading-snug tracking-[-0.06em] text-slate-950"}>
            {productName}
          </h3>

          <p className={v2 ? "mt-1 break-keep text-[14px] font-normal text-[#707072]" : "mt-1 truncate text-[12px] font-bold tracking-[-0.04em] text-slate-500"} title={optionAndQuantity}>
            {optionAndQuantity}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className={v2 ? "text-[13px] font-normal text-[#707072]" : "text-[11px] font-bold tracking-[-0.04em] text-slate-400"}>
            결제금액
          </p>
          <p className={v2 ? "mt-1 text-[19px] font-bold text-[#111111]" : "mt-1 text-[18px] font-black tracking-[-0.06em] text-slate-950"}>
            {amountText}
          </p>
        </div>
      </div>

      <div className={v2 ? "mt-3 grid grid-cols-2 gap-2 rounded-[8px] bg-[#F5F5F5] px-3 py-2 text-[13px] font-normal text-[#39393B]" : "mt-3 grid grid-cols-2 gap-2 rounded-[16px] bg-slate-50 px-3 py-2 text-[12px] font-bold tracking-[-0.04em] text-slate-600 ring-1 ring-slate-100"}>
        <div className="min-w-0">
          <p className={v2 ? "text-[#707072]" : "text-slate-400"}>주문번호</p>
          <p className={v2 ? "mt-0.5 truncate font-semibold text-[#111111]" : "mt-0.5 truncate font-black text-slate-800"} title={orderCode}>
            {orderCode}
          </p>
        </div>

        <div className="min-w-0 text-right">
          <p className={v2 ? "text-[#707072]" : "text-slate-400"}>주문일</p>
          <p className={v2 ? "mt-0.5 break-keep font-semibold text-[#111111]" : "mt-0.5 truncate font-black text-slate-800"}>
            {displayDate}
          </p>
        </div>
      </div>

      {pointUsedAmount > 0 ? (
        <div className={v2 ? "mt-2 rounded-[8px] bg-[#F5F5F5] px-3 py-2 text-[14px] font-normal leading-relaxed text-[#39393B]" : "mt-2 rounded-[16px] bg-emerald-50 px-3 py-2 text-[12px] font-black leading-relaxed tracking-[-0.04em] text-emerald-800 ring-1 ring-emerald-100"}>
          <div className="flex items-center justify-between gap-3">
            <span>상품금액</span>
            <span>{pointWon(pointOriginalAmount)}</span>
          </div>
          <div className={v2 ? "mt-0.5 flex items-center justify-between gap-3 text-[#39393B]" : "mt-0.5 flex items-center justify-between gap-3 text-emerald-700"}>
            <span>포인트 사용</span>
            <span>-{pointWon(pointUsedAmount)}</span>
          </div>
          <div className={v2 ? "mt-0.5 flex items-center justify-between gap-3 border-t border-[#CACACB] pt-1 font-semibold text-[#111111]" : "mt-0.5 flex items-center justify-between gap-3 border-t border-emerald-100 pt-1 text-orange-700"}>
            <span>최종 결제금액</span>
            <span>{pointWon(finalPaymentAmount)}</span>
          </div>
        </div>
      ) : null}

      {trackingNumber ? (
        <div className={v2 ? "mt-2 rounded-[8px] bg-[#F5F5F5] p-3" : "mt-2 rounded-[16px] bg-blue-50 p-3 ring-1 ring-blue-100"}>
          <p className={v2 ? "text-[14px] font-normal text-[#707072]" : "text-[12px] font-bold tracking-[-0.04em] text-slate-600"}>{v2 ? null : "🚚 "}{trackingCompany || "로젠택배"} 송장번호</p>
          <p className={v2 ? "mt-0.5 text-[16px] font-semibold text-[#111111]" : "mt-0.5 text-[15px] font-black tracking-[-0.02em] text-slate-900"} style={{ wordBreak: "break-all" }}>{trackingNumber}</p>
          <a
            href={trackingUrl}
            target="_blank"
            rel="noreferrer"
            className={v2 ? "mt-2 flex min-h-[44px] items-center justify-center rounded-full bg-[#111111] px-3 text-[15px] font-semibold text-white transition active:scale-[0.97]" : "mt-2 flex min-h-[38px] items-center justify-center rounded-[14px] bg-blue-700 px-3 py-2 text-[12px] font-black tracking-[-0.04em] text-white transition active:scale-[0.98]"}
          >
            배송 조회하기
          </a>
        </div>
      ) : null}

      {showBandTrackingNotice ? (
        <div className={v2 ? "mt-2 rounded-[8px] bg-[#F5F5F5] p-3" : "mt-2 rounded-[16px] bg-blue-50 p-3 ring-1 ring-blue-100"}>
          <p className={v2 ? "break-keep text-[14px] font-normal leading-relaxed text-[#39393B]" : "break-keep text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-600"}>
            출고완료 후 당일 늦은 오후~저녁 사이 밴드에서 송장조회가 가능합니다.
          </p>
          <a
            href="https://band.us/@ruru8249"
            target="_blank"
            rel="noreferrer"
            className={v2 ? "mt-2 flex min-h-[44px] items-center justify-center rounded-full border border-[#CACACB] bg-white px-3 text-[15px] font-semibold text-[#111111] transition active:scale-[0.97]" : "mt-2 flex min-h-[38px] items-center justify-center rounded-[14px] bg-white px-3 py-2 text-[12px] font-black tracking-[-0.04em] text-blue-700 ring-1 ring-blue-100 transition active:scale-[0.98]"}
          >
            밴드에서 송장조회
          </a>
        </div>
      ) : null}

      {order.cancel_reason ? (
        <div className={v2 ? "mt-2 rounded-[8px] bg-[#F5F5F5] p-3 text-[14px] font-semibold leading-relaxed text-[#D30005]" : "mt-2 rounded-[16px] bg-red-50 p-3 text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-red-600 ring-1 ring-red-100"}>
          취소 사유: {order.cancel_reason}
        </div>
      ) : null}
    </article>
  );
}
