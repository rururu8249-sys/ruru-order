// components/admin-v2/orders/adminOrderPaymentFilterUtils.ts
// 목적: 주문관리 결제필터 분류 전용 유틸
// 주의: 화면 필터용. 입금확인 저장, 자동매칭, 뱅크다, 금액 계산, DB 저장 없음.

import type { OrderRow } from "@/lib/admin-v2/types";
import {
  isBankPaid,
  isBankPayment,
  isBankUnpaid,
  isCardPaid,
  isCardPayment,
  isCardUnpaid,
} from "@/lib/admin-v2/orderHelpers";

export type AdminOrderPaymentFilterBucket =
  | "unpaid"
  | "paid"
  | "bank"
  | "card"
  | "unknown";

function normalize(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function includesAnyText(source: unknown, keywords: string[]) {
  const target = normalize(source);
  return keywords.some((keyword) => target.includes(normalize(keyword)));
}

function addUnique(
  buckets: AdminOrderPaymentFilterBucket[],
  bucket: AdminOrderPaymentFilterBucket
) {
  if (!buckets.includes(bucket)) buckets.push(bucket);
}

export function getOrderPaymentFilterBuckets(
  row: Pick<
    OrderRow,
    "payment_method" | "admin_order_status_v2" | "order_manage_status" | "deposit_confirmed_at"
  >,
  extra?: {
    statusText?: string;
    paymentText?: string;
  }
) {
  const buckets: AdminOrderPaymentFilterBucket[] = [];

  const statusText = [
    extra?.statusText,
    row.admin_order_status_v2,
    row.order_manage_status,
  ].join(" ");

  const paymentText = [
    extra?.paymentText,
    row.payment_method,
  ].join(" ");

  if (
    isBankUnpaid(row) ||
    isCardUnpaid(row) ||
    includesAnyText(statusText, ["미결제", "미입금", "입금대기", "확인대기"]) ||
    includesAnyText(paymentText, ["미결제", "미입금", "입금대기", "링크대기"])
  ) {
    addUnique(buckets, "unpaid");
  }

  if (
    isBankPaid(row) ||
    isCardPaid(row) ||
    includesAnyText(statusText, ["결제완료", "입금확인"]) ||
    includesAnyText(paymentText, ["결제완료", "입금확인"])
  ) {
    addUnique(buckets, "paid");
  }

  if (isBankPayment(row) || includesAnyText(paymentText, ["무통장", "입금", "계좌"])) {
    addUnique(buckets, "bank");
  }

  if (isCardPayment(row) || includesAnyText(paymentText, ["카드"])) {
    addUnique(buckets, "card");
  }

  if (buckets.length === 0) {
    addUnique(buckets, "unknown");
  }

  return buckets;
}
