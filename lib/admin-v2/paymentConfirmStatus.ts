// lib/admin-v2/paymentConfirmStatus.ts
// 목적: 자동/수동 입금확인 표시 문구 통일
// 주의: 표시/상태명 상수 전용. 금액계산, 매칭조건, DB 조회/저장 로직 없음.

import { getDepositMatchStatusLabel } from "./statusDisplay";

export const PAYMENT_CONFIRM_STATUS = {
  GENERIC: "입금확인",
  AUTO: "자동입금확인",
  MANUAL: "수동입금확인",
} as const;

export type PaymentConfirmStatus =
  (typeof PAYMENT_CONFIRM_STATUS)[keyof typeof PAYMENT_CONFIRM_STATUS];

export function paymentConfirmStatusLabel(value: unknown) {
  return getDepositMatchStatusLabel(value);
}
