// lib/admin-v2/orderHelpers.ts
// 주문/결제/금액 기준 판단 유틸
// 리팩토링 1단계: 기존 판단 로직 그대로 분리. 계산 결과 변경 없음.

import type { OrderGroup, OrderRow, SettingRow } from "./types";
import { PAID_STATUSES } from "./constants";
import { getAdminOrderStatusDesc, getAdminOrderStatusLabel, getDeliveryStageStatusLabel, isCanceledStatus } from "./statusDisplay";

export const readSettingNumber = (settings: SettingRow[], key: string, fallback: number) => {
  const found = settings.find((item) => item.key === key);
  const parsed = Number(found?.value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toSafeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const roundWon = (value: unknown) => Math.round(toSafeNumber(value, 0));

export const orderOriginalAmount = (row: Pick<OrderRow, "total_price">) => roundWon(row.total_price);

export const orderCalculatedAmount = (row: Pick<OrderRow, "adjusted_total_price" | "total_price">) =>
  roundWon(row.adjusted_total_price ?? row.total_price ?? 0);

// 현재 최종정산 기준 금액.
// final_amount가 있으면 final_amount를 최우선으로 사용하고, 없으면 조정금액/원본금액 순서로 사용합니다.
export const orderBaseAmount = (row: Pick<OrderRow, "final_amount" | "adjusted_total_price" | "total_price">) =>
  roundWon(row.final_amount ?? row.adjusted_total_price ?? row.total_price ?? 0);

export const orderRefundAmount = (row: Pick<OrderRow, "refund_amount">) =>
  Math.max(0, roundWon(row.refund_amount ?? 0));

export const orderCanceledAmount = (
  row: Pick<OrderRow, "admin_order_status_v2" | "order_manage_status" | "final_amount" | "adjusted_total_price" | "total_price">
) => {
  if (!isOrderCanceled(row)) return 0;
  return orderBaseAmount(row);
};

// 실제 매출 반영 금액.
// 주문취소는 0원 처리하고, refund_amount가 따로 있으면 최종정산 기준에서 차감합니다.
// 주의: final_amount 자체가 이미 환불 반영 금액이라면 refund_amount를 중복 입력하지 않는 운영 기준이 필요합니다.
export const orderNetSalesAmount = (
  row: Pick<OrderRow, "admin_order_status_v2" | "order_manage_status" | "final_amount" | "adjusted_total_price" | "total_price" | "refund_amount">
) => {
  if (isOrderCanceled(row)) return 0;

  const baseAmount = orderBaseAmount(row);
  const refundAmount = orderRefundAmount(row);

  return Math.max(0, baseAmount - refundAmount);
};

export const orderActualCardFeeRate = (row: Pick<OrderRow, "actual_card_fee_rate_applied">, fallbackActualRate = 7) => {
  const appliedRate = toSafeNumber(row.actual_card_fee_rate_applied, NaN);
  return Number.isFinite(appliedRate) ? appliedRate : fallbackActualRate;
};

export const orderCustomerCardExtraRate = (row: Pick<OrderRow, "customer_card_extra_rate_applied">, fallbackCustomerRate = 0) => {
  const appliedRate = toSafeNumber(row.customer_card_extra_rate_applied, NaN);
  return Number.isFinite(appliedRate) ? appliedRate : fallbackCustomerRate;
};

export const orderCustomerCardExtraAmount = (row: Pick<OrderRow, "payment_method" | "vat_amount" | "admin_order_status_v2" | "order_manage_status">) => {
  if (!isCardPayment(row) || isOrderCanceled(row)) return 0;
  return Math.max(0, roundWon(row.vat_amount ?? 0));
};

export const orderActualCardFeeAmount = (
  row: Pick<OrderRow, "payment_method" | "admin_order_status_v2" | "order_manage_status" | "final_amount" | "adjusted_total_price" | "total_price" | "refund_amount" | "actual_card_fee_rate_applied">,
  fallbackActualRate = 7
) => {
  if (!isCardPayment(row) || !isOrderPaid(row) || isOrderCanceled(row)) return 0;

  const rate = orderActualCardFeeRate(row, fallbackActualRate);
  return Math.round(orderNetSalesAmount(row) * (rate / 100));
};

export const groupNetSalesAmount = (group: Pick<OrderGroup, "rows">) =>
  group.rows.reduce((sum, row) => sum + orderNetSalesAmount(row), 0);

export const groupGrossBaseAmount = (group: Pick<OrderGroup, "rows">) =>
  group.rows.reduce((sum, row) => sum + orderBaseAmount(row), 0);

export const groupCanceledAmount = (group: Pick<OrderGroup, "rows">) =>
  group.rows.reduce((sum, row) => sum + orderCanceledAmount(row), 0);

export const groupRefundAmount = (group: Pick<OrderGroup, "rows">) =>
  group.rows.reduce((sum, row) => sum + (isOrderCanceled(row) ? 0 : orderRefundAmount(row)), 0);

export const groupActualCardFeeAmount = (group: Pick<OrderGroup, "rows">, fallbackActualRate = 7) =>
  group.rows.reduce((sum, row) => sum + orderActualCardFeeAmount(row, fallbackActualRate), 0);

export const groupCustomerCardExtraAmount = (group: Pick<OrderGroup, "rows">) =>
  group.rows.reduce((sum, row) => sum + orderCustomerCardExtraAmount(row), 0);

export const getOrderStatusValue = (row: Pick<OrderRow, "admin_order_status_v2" | "order_manage_status">) => {
  return String(row.admin_order_status_v2 || row.order_manage_status || "미설정").trim() || "미설정";
};

export const getOrderStatusLabel = (status: string | null | undefined) => {
  return getDeliveryStageStatusLabel(status);
};

export const isOrderCanceled = (row: Pick<OrderRow, "admin_order_status_v2" | "order_manage_status">) => {
  return isCanceledStatus(getOrderStatusValue(row));
};

export const isOrderPaid = (row: Pick<OrderRow, "admin_order_status_v2" | "order_manage_status">) => {
  return PAID_STATUSES.includes(getOrderStatusValue(row));
};

export const isBankPayment = (row: Pick<OrderRow, "payment_method">) => {
  return String(row.payment_method || "무통장입금") === "무통장입금";
};

export const isCardPayment = (row: Pick<OrderRow, "payment_method">) => {
  return String(row.payment_method || "") === "카드결제";
};

export const isPaymentUnpaid = (
  row: Pick<OrderRow, "admin_order_status_v2" | "order_manage_status" | "payment_method">
) => {
  return !isOrderCanceled(row) && !isOrderPaid(row);
};

export const isBankPaid = (row: Pick<OrderRow, "payment_method" | "admin_order_status_v2" | "order_manage_status">) =>
  isBankPayment(row) && isOrderPaid(row);

export const isCardPaid = (row: Pick<OrderRow, "payment_method" | "admin_order_status_v2" | "order_manage_status">) =>
  isCardPayment(row) && isOrderPaid(row);

export const isBankUnpaid = (row: Pick<OrderRow, "payment_method" | "admin_order_status_v2" | "order_manage_status">) =>
  isBankPayment(row) && isPaymentUnpaid(row);

export const isCardUnpaid = (row: Pick<OrderRow, "payment_method" | "admin_order_status_v2" | "order_manage_status">) =>
  isCardPayment(row) && isPaymentUnpaid(row);

export const paymentStatusMeta = (
  row: Pick<OrderRow, "admin_order_status_v2" | "order_manage_status" | "payment_method">
) => {
  const paymentMethod = String(row.payment_method || "무통장입금");
  const status = getOrderStatusValue(row);
  const label = getAdminOrderStatusLabel({ status, paymentMethod });
  const desc = getAdminOrderStatusDesc({ status, paymentMethod });

  if (isCanceledStatus(status)) {
    return {
      label,
      desc,
      className: "bg-red-100 text-red-700",
    };
  }

  if (PAID_STATUSES.includes(status)) {
    return {
      label,
      desc,
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (paymentMethod === "카드결제") {
    return {
      label,
      desc,
      className: "bg-rose-100 text-rose-700",
    };
  }

  return {
    label,
    desc,
    className: "bg-amber-100 text-amber-800",
  };
};

export const selectClass = (status?: string | null) => {
  const value = String(status || "미설정").trim() || "미설정";

  if (value === "미설정") return "border-amber-300 bg-amber-50 text-amber-900";
  if (["입금확인", "자동입금확인", "수동입금확인"].includes(value)) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (value === "출고대기") return "border-amber-300 bg-amber-50 text-amber-800";
  if (value === "출고완료") return "border-blue-300 bg-blue-50 text-blue-800";
  if (value === "킵") return "border-violet-300 bg-violet-50 text-violet-800";
  if (value === "픽업" || value === "픽업예정") return "border-cyan-300 bg-cyan-50 text-cyan-800";
  if (isCanceledStatus(value)) return "border-red-300 bg-red-50 text-red-800";

  return "border-neutral-300 bg-white text-neutral-700";
};

export function shortOrderCode(group: OrderGroup) {
  return String(group.first.order_lookup_code || group.groupId || group.first.id || "-").replace("RURU-", "");
}

export function buildProductSummaryFromRow(row: Pick<OrderRow, "product_name" | "color" | "size" | "qty">) {
  const parts = [
    row.product_name || "상품명 없음",
    row.color && row.color !== "없음" ? row.color : "",
    row.size && row.size !== "없음" ? row.size : "",
  ].filter(Boolean);

  const qty = Number(row.qty || 1);
  return `${parts.join(" / ")} x${qty || 1}`;
}

export function buildItemSummary(group: OrderGroup) {
  const firstText = buildProductSummaryFromRow(group.rows[0]);

  if (group.rows.length <= 1) return firstText;
  return `${firstText} 외 ${group.rows.length - 1}개`;
}

export function getShippingRequestMemo(row: Pick<OrderRow, "request_memo">) {
  return String(row.request_memo || "").trim();
}

export function getAdminMemo(row: Pick<OrderRow, "admin_memo">) {
  return String(row.admin_memo || "").trim();
}

export function getSpecialNote(row: Pick<OrderRow, "special_note">) {
  return String(row.special_note || "").trim();
}

export function getLegacyProductMemo(row: Pick<OrderRow, "memo">) {
  return String(row.memo || "").trim();
}

export function getShippingExcelMemo(row: Pick<OrderRow, "request_memo">) {
  // 택배사 엑셀의 배송메모/배송요청사항에는 상품요약(memo)을 절대 넣지 않습니다.
  // 고객이 직접 입력한 배송메모(request_memo)만 사용합니다.
  return getShippingRequestMemo(row);
}
