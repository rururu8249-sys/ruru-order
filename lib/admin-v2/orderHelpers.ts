// lib/admin-v2/orderHelpers.ts
// 주문/결제/금액 기준 판단 유틸
// 리팩토링 1단계: 기존 판단 로직 그대로 분리. 계산 결과 변경 없음.

import type { OrderGroup, OrderRow, SettingRow } from "./types";
import { ORDER_STATUS_OPTIONS, PAID_STATUSES } from "./constants";

export const readSettingNumber = (settings: SettingRow[], key: string, fallback: number) => {
  const found = settings.find((item) => item.key === key);
  const parsed = Number(found?.value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const orderBaseAmount = (row: OrderRow) =>
  Number(row.final_amount ?? row.adjusted_total_price ?? row.total_price ?? 0);

export const getOrderStatusValue = (row: Pick<OrderRow, "admin_order_status_v2" | "order_manage_status">) => {
  return String(row.admin_order_status_v2 || row.order_manage_status || "미설정").trim() || "미설정";
};

export const getOrderStatusLabel = (status: string | null | undefined) => {
  const value = String(status || "미설정").trim() || "미설정";
  return ORDER_STATUS_OPTIONS.find((option) => option.value === value)?.label || value;
};

export const isOrderCanceled = (row: Pick<OrderRow, "admin_order_status_v2" | "order_manage_status">) => {
  return getOrderStatusValue(row) === "주문취소";
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

export const paymentStatusMeta = (
  row: Pick<OrderRow, "admin_order_status_v2" | "order_manage_status" | "payment_method">
) => {
  const paymentMethod = String(row.payment_method || "무통장입금");
  const status = getOrderStatusValue(row);

  if (status === "주문취소") {
    return {
      label: "주문취소",
      desc: "매출 제외",
      className: "bg-red-100 text-red-700",
    };
  }

  if (PAID_STATUSES.includes(status)) {
    return {
      label: paymentMethod === "카드결제" ? "카드 결제완료" : "무통장 입금확인",
      desc: getOrderStatusLabel(status),
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (paymentMethod === "카드결제") {
    return {
      label: "카드 미결제",
      desc: "링크발송/결제확인 필요",
      className: "bg-rose-100 text-rose-700",
    };
  }

  if (paymentMethod === "무통장입금") {
    return {
      label: "무통장 미입금",
      desc: "입금확인 필요",
      className: "bg-amber-100 text-amber-800",
    };
  }

  return {
    label: "결제확인 필요",
    desc: paymentMethod || "결제수단 없음",
    className: "bg-neutral-100 text-neutral-700",
  };
};

export const selectClass = (status?: string | null) => {
  if (!status || status === "미설정") return "border-amber-300 bg-amber-50 text-amber-900";
  if (status === "입금확인") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "출고대기") return "border-amber-300 bg-amber-50 text-amber-800";
  if (status === "출고완료") return "border-blue-300 bg-blue-50 text-blue-800";
  if (status === "킵") return "border-violet-300 bg-violet-50 text-violet-800";
  if (status === "픽업예정") return "border-cyan-300 bg-cyan-50 text-cyan-800";
  if (status === "주문취소") return "border-red-300 bg-red-50 text-red-800";
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
