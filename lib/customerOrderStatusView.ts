// [㊲ 2026-10-19] 손님 화면 주문 상태 «표시» 한 곳 — /myorder(주문내역 페이지)와 주문서 화면 「주문내역」 창이 같은 주문을 같은 상태로 보이게.
//   표시 전용. 주문상태 값·입금·환불·포인트 계산은 읽기만 한다(상태를 정하는 getCustomerOrderStatusLabel 은 그대로 사용).
//   버그: getCustomerOrderStatusLabel 은 취소를 "주문서취소"(띄어쓰기 없음)로 주는데 /myorder 는 "주문취소"/"주문서 취소"만 비교 →
//         취소 주문이 「입금대기」로 보였다. 환불도 입금대기 필터에 섞였다. 주문서 화면은 취소·환불을 「주문취소」로 보여 두 화면이 달랐다.
import { getCustomerOrderStatusLabel } from "./admin-v2/statusDisplay";

export type CustomerOrderFilter = "입금대기" | "입금확인" | "출고완료" | "주문취소";
export const CUSTOMER_ORDER_FILTERS = ["전체", "입금대기", "입금확인", "출고완료", "주문취소"] as const;

const text = (value: unknown) => String(value ?? "").trim();

const CANCEL_LABELS = new Set(["주문취소", "주문서 취소", "주문서취소"]);
const REFUND_LABELS = new Set(["환불완료", "부분환불"]);
const PAID_LABELS = new Set([
  "입금확인완료", "입금확인", "자동입금확인", "수동입금확인", "확인완료", "출고준비중", "결제완료", "카드결제완료",
]);

export const isCancelLabel = (label: string) => CANCEL_LABELS.has(label);
export const isRefundLabel = (label: string) => REFUND_LABELS.has(label);

/** 환불이면 「부분환불」/「환불완료」, 아니면 null (관리 상태 "환불" + refund_type 기준 — /myorder 원래 규칙 그대로). */
export function refundLabelOf(order: any): "부분환불" | "환불완료" | null {
  const manage = text(order?.order_manage_status || order?.admin_order_status_v2);
  if (manage !== "환불") return null;
  return text(order?.refund_type) === "부분환불" ? "부분환불" : "환불완료";
}

/** /myorder 상태 글자(원래 app/myorder/page.tsx getCustomerStatusLabel 그대로 옮김). */
export function myOrderStatusLabel(order: any): string {
  const refund = refundLabelOf(order);
  if (refund) return refund;
  const manage = text(order?.order_manage_status || order?.admin_order_status_v2);
  return getCustomerOrderStatusLabel(manage || order?.order_status);
}

/** /myorder 필터 칸 — 취소·환불은 「주문취소」(예전엔 입금대기로 섞였다). */
export function myOrderFilterOf(label: string): CustomerOrderFilter {
  if (isCancelLabel(label) || isRefundLabel(label)) return "주문취소";
  if (label === "배송출발" || label === "출고완료") return "출고완료";
  if (PAID_LABELS.has(label)) return "입금확인";
  return "입금대기";
}

/** /myorder 카드의 결제·배송 상태와 배지 글자(원래 MyOrderResultCard 계산 + 「주문서취소」 인식). */
export function myOrderChipView(label: string): { paymentStatus: string; deliveryStatus: string; chipText: string } {
  const canceled = isCancelLabel(label);
  const refunded = isRefundLabel(label);
  const paymentStatus = canceled ? "주문취소" : refunded ? label : PAID_LABELS.has(label) || label === "배송출발" || label === "출고완료" ? "입금확인" : "입금대기";
  const deliveryStatus =
    label === "배송출발" || label === "출고완료" ? "출고완료"
      : label === "출고준비중" || label === "확인완료" ? "출고준비"
        : canceled ? "주문취소" : refunded ? label : "확인중";
  return { paymentStatus, deliveryStatus, chipText: deliveryStatus === "출고완료" ? "출고완료" : paymentStatus };
}

/** 주문서 화면 「주문내역」 창 상태(원래 app/order/page.tsx ruruOrderLookupStatus 판정 그대로 옮김).
 *  필터 이름만 /myorder 와 같게(결제대기→입금대기, 결제완료→입금확인), 배지는 이모지 없이 /myorder 와 같은 글자. */
export function orderLookupStatusView(order: any): { filterKey: CustomerOrderFilter; displayText: string } {
  // 1) 주문취소 최우선(취소·환불)
  const cancelText = [order?.payment_status, order?.paymentStatus, order?.order_manage_status, order?.order_status, order?.admin_status, order?.admin_order_status_v2, order?.status]
    .map(text).join(" ");
  if (/주문서취소|주문취소|취소|환불|cancel|refund/i.test(cancelText)) {
    return { filterKey: "주문취소", displayText: refundLabelOf(order) ?? "주문취소" };
  }
  // 2) 출고완료
  const deliveryText = [order?.delivery_status, order?.shipping_status, order?.tracking_number, order?.invoice_number, order?.waybill_number, order?.order_manage_status, order?.admin_status]
    .map(text).join(" ");
  if (/출고완료|택배출고|배송출발|배송완료|송장|shipped/i.test(deliveryText)) {
    return { filterKey: "출고완료", displayText: "출고완료" };
  }
  // 3) 결제상태 (무통장 vs 카드)
  const paymentText = [order?.payment_status, order?.deposit_status, order?.admin_order_status_v2, order?.order_manage_status, order?.order_status, order?.admin_status, order?.status]
    .map(text).join(" ");
  const isCard = /카드/.test(text(order?.payment_method)) || /card/i.test(paymentText);
  if (isCard) {
    if (/카드결제완료|card_paid|결제완료/i.test(paymentText)) return { filterKey: "입금확인", displayText: "입금확인" };
    return { filterKey: "입금대기", displayText: "입금대기" };
  }
  if (/입금확인|자동입금|수동입금|입금완료|확인완료|출고준비|결제완료|bank_paid|auto_paid|manual_paid/i.test(paymentText)) {
    return { filterKey: "입금확인", displayText: "입금확인" };
  }
  return { filterKey: "입금대기", displayText: "입금대기" };
}

/** 옵션 글자에서 「없음」 류 빼기(/myorder cleanOption 과 같은 목록). */
export function cleanCustomerOptionValue(value: unknown): string {
  const t = text(value);
  if (!t) return "";
  return ["없음", "없슴", "x", "X", "-", "none", "None", "NONE"].includes(t) ? "" : t;
}
