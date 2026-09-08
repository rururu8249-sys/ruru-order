// lib/orderLabels.ts
// [2026-09-07 전수감사] 관리자 화면 "표시 문구" 사전 — 여기 한 곳만 고치면 모든 화면이 따라옴.
// 주의: 표시 전용. DB 상태값(admin_order_status_v2 등)·결제완료 판정·입금매칭·정산 계산은 절대 여기서 바꾸지 않는다.
//
// 확정 용어(시안 기준):
//   입금상태  미입금 / 매칭필요 / 자동입금확인 / 수동입금확인 / 카드미결제 / 카드결제완료
//     [2026-09-09 사장님 요청] 자동/수동을 다시 «배지 글자»로 구분한다.
//     2026-09-07 에 둘 다 「입금확인」으로 묶었는데, 어느 쪽으로 확인된 건지 화면에서 알 수 없어졌다.
//     ⚠ 돈 판정은 상태 «코드»(auto_paid/manual_paid)로만 한다 — 글자를 바꿔도 판정은 그대로다.
//   묶음      결제완료(=입금확인+카드결제완료) / 미결제(=미입금+매칭필요+카드미결제)
//   취소      주문서취소
//   출고      출고대기 / 택배출고 (DB 값 "출고완료"를 화면에서만 "택배출고"로)
//   결제수단  무통장 / 카드
//   입금 건   매칭완료 / 미매칭 / 확인필요
//   화면명    입금내역 / 입금매칭

export type LivePaymentStatusCode =
  | "unpaid"
  | "manual_match_needed"
  | "paid"
  | "auto_paid"
  | "manual_paid"
  | "card_unpaid"
  | "card_paid"
  | "canceled";

export const PAYMENT_STATUS_LABEL: Record<LivePaymentStatusCode, string> = {
  unpaid: "미입금",
  manual_match_needed: "매칭필요",
  paid: "입금확인",
  auto_paid: "자동입금확인",
  manual_paid: "수동입금확인",
  card_unpaid: "카드미결제",
  card_paid: "카드결제완료",
  canceled: "주문서취소",
};

/** 입금확인의 자동/수동 구분 — 배지 본문이 아니라 툴팁·상세에만 쓴다. */
export const PAYMENT_STATUS_DETAIL: Partial<Record<LivePaymentStatusCode, string>> = {
  auto_paid: "자동 입금확인(뱅크다 매칭)",
  manual_paid: "수동 입금확인(관리자 확인)",
  paid: "입금확인",
};

export function paymentStatusLabel(code: string | null | undefined): string {
  const key = String(code || "") as LivePaymentStatusCode;
  return PAYMENT_STATUS_LABEL[key] ?? "입금확인";
}

export function paymentStatusDetail(code: string | null | undefined): string {
  const key = String(code || "") as LivePaymentStatusCode;
  return PAYMENT_STATUS_DETAIL[key] ?? PAYMENT_STATUS_LABEL[key] ?? "";
}

/** 필터·통계 묶음 이름 */
export const PAYMENT_GROUP_LABEL = {
  paid: "결제완료",
  unpaid: "미결제",
  all: "전체",
} as const;

/** 출고 단계 — DB 값 그대로 받아 표시만 바꾼다. */
export const SHIPPING_STATUS_LABEL: Record<string, string> = {
  출고대기: "출고대기",
  출고완료: "택배출고",
  킵: "킵",
  픽업: "픽업",
  픽업예정: "픽업",
};

export function shippingStatusLabel(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  return SHIPPING_STATUS_LABEL[value] ?? value;
}

/** 결제수단 — DB 값 "무통장입금"/"카드결제"를 화면에서 "무통장"/"카드"로 */
export function paymentMethodLabel(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value) return "무통장";
  if (value.includes("카드")) return "카드";
  return "무통장";
}

/** 입금 건(뱅크다 1건) 상태 — 내부값 "확인완료/미확인/주의"는 그대로, 표시만 */
export const DEPOSIT_LEDGER_STATUS_LABEL: Record<string, string> = {
  확인완료: "매칭완료",
  미확인: "미매칭",
  주의: "확인필요",
  전체: "전체",
};

export function depositLedgerStatusLabel(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  return DEPOSIT_LEDGER_STATUS_LABEL[value] ?? value;
}

/** 화면명 */
export const SCREEN_NAME = {
  deposits: "입금내역",
  matching: "입금매칭",
  orders: "실시간 주문",
} as const;
