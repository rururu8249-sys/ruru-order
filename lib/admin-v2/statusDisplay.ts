// lib/admin-v2/statusDisplay.ts
// 목적: 관리자/고객 화면의 주문상태·배송처리단계 표시 문구 통일
// 주의: 표시 문구 전용. DB 상태값, 돈계산, 입금매칭, 자동매칭, 로젠 송장 로직 없음.

export const PAID_STATUS_VALUES: string[] = [
  "입금확인",
  "자동입금확인",
  "수동입금확인",
  "카드결제완료",
  "결제완료",
  "출고대기",
  "출고완료",
  "킵",
  "픽업",
  "픽업예정",
];

export const DELIVERY_STAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "미설정", label: "미설정" },
  { value: "출고대기", label: "포장전" },
  { value: "출고완료", label: "발송완료" },
  { value: "킵", label: "킵보관" },
  { value: "픽업", label: "픽업완료" },
];

export function normalizeOrderStatus(status: string | null | undefined) {
  return String(status || "미설정").trim() || "미설정";
}

export function isCanceledStatus(status: string | null | undefined) {
  const value = normalizeOrderStatus(status);
  return value === "주문취소" || value === "주문서취소";
}

export function getAdminOrderStatusLabel(params: {
  status: string | null | undefined;
  paymentMethod?: string | null;
}) {
  const status = normalizeOrderStatus(params.status);
  const paymentMethod = String(params.paymentMethod || "무통장입금").trim();

  if (isCanceledStatus(status)) return "주문서취소";
  if (paymentMethod === "카드결제" && !PAID_STATUS_VALUES.includes(status)) return "카드미결제";
  if (paymentMethod === "카드결제") return "카드결제완료";
  if (status === "수동입금확인") return "결제완료(수동)";
  if (PAID_STATUS_VALUES.includes(status)) return "결제완료(무통장)";

  return "미결제";
}

export function getAdminOrderStatusDesc(params: {
  status: string | null | undefined;
  paymentMethod?: string | null;
}) {
  const status = normalizeOrderStatus(params.status);
  const paymentMethod = String(params.paymentMethod || "무통장입금").trim();

  if (isCanceledStatus(status)) return "매출 제외";
  if (paymentMethod === "카드결제" && !PAID_STATUS_VALUES.includes(status)) return "카드 결제 필요";
  if (paymentMethod === "카드결제") return "카드 결제 확인";
  if (status === "수동입금확인") return "관리자 수동 확인";
  if (status === "자동입금확인") return "자동입금확인";
  if (PAID_STATUS_VALUES.includes(status)) return "무통장입금";

  return "입금 매칭 필요";
}

export function getDeliveryStageStatusValue(status: string | null | undefined) {
  const value = normalizeOrderStatus(status);

  if (["출고대기", "출고완료", "킵", "픽업", "픽업예정"].includes(value)) {
    return value === "픽업예정" ? "픽업" : value;
  }

  return "미설정";
}

export function getDeliveryStageStatusLabel(status: string | null | undefined) {
  const value = normalizeOrderStatus(status);

  if (value === "출고대기") return "포장전";
  if (value === "출고완료") return "발송완료";
  if (value === "킵") return "킵보관";
  if (value === "픽업" || value === "픽업예정") return "픽업완료";

  return "미설정";
}

export function getDepositMatchStatusLabel(value: unknown) {
  const status = String(value || "").trim();

  if (!status) return "미확인";
  if (status === "수동입금확인") return "결제완료(수동)";
  if (status === "자동입금확인") return "결제완료(무통장)";
  if (status === "입금확인") return "결제완료(무통장)";

  return status;
}

export function getCustomerOrderStatusLabel(status: string | null | undefined) {
  // CUSTOMER_PAYMENT_DONE_LABEL_PATCH
  // 고객 주문조회 화면에서는 관리자 내부 상태값을 단순하게 통일 표시합니다.
  // 자동입금확인/수동입금확인/입금확인/카드결제완료 모두 고객에게는 "입금확인완료"로 표시합니다.
  const customerPaymentStatusText = String(status ?? "").trim();

  if (
    /자동입금확인|수동입금확인|입금확인|카드결제완료|카드완료|결제완료|paid|confirmed|complete/i.test(
      customerPaymentStatusText
    )
  ) {
    return "입금확인완료";
  }


  const value = normalizeOrderStatus(status);

  if (isCanceledStatus(value)) return "주문서취소";
  if (value === "출고완료") return "배송출발";
  if (value === "출고대기") return "출고준비중";
  if (value === "픽업" || value === "픽업예정") return "픽업예정";
  if (PAID_STATUS_VALUES.includes(value)) return "입금확인";

  return "주문접수";
}
