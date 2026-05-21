// components/admin-v2/orders/adminOrderStatusFilterUtils.ts
// 목적: 주문관리 상태필터 분류 전용 유틸
// 주의: 화면 필터용. 입금확인 저장, 자동매칭, 뱅크다, 금액 계산, DB 저장 없음.

import type { OrderRow } from "@/lib/admin-v2/types";
import {
  isBankPaid,
  isBankUnpaid,
  isCardPaid,
  isCardUnpaid,
  isOrderCanceled,
} from "@/lib/admin-v2/orderHelpers";

export type AdminOrderStatusFilterBucket =
  | "unpaid"
  | "paid"
  | "ready"
  | "shipped"
  | "canceled"
  | "unknown";

function normalize(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function includesAnyText(source: unknown, keywords: string[]) {
  const target = normalize(source);
  return keywords.some((keyword) => target.includes(normalize(keyword)));
}

function addUnique(
  buckets: AdminOrderStatusFilterBucket[],
  bucket: AdminOrderStatusFilterBucket
) {
  if (!buckets.includes(bucket)) buckets.push(bucket);
}

export function getOrderStatusFilterBuckets(
  row: Pick<
    OrderRow,
    | "payment_method"
    | "admin_order_status_v2"
    | "order_manage_status"
    | "deposit_confirmed_at"
    | "shipped_at"
  >,
  extra?: {
    statusText?: string;
    paymentText?: string;
  }
) {
  const buckets: AdminOrderStatusFilterBucket[] = [];

  const statusText = [
    extra?.statusText,
    row.admin_order_status_v2,
    row.order_manage_status,
  ].join(" ");

  const paymentText = [
    extra?.paymentText,
    row.payment_method,
  ].join(" ");

  const canceled =
    isOrderCanceled(row) ||
    includesAnyText(statusText, ["취소", "환불", "주문취소", "주문서취소"]);

  const unpaid =
    !canceled &&
    (
      isBankUnpaid(row) ||
      isCardUnpaid(row) ||
      includesAnyText(statusText, ["미결제", "미입금", "입금대기", "확인대기"]) ||
      includesAnyText(paymentText, ["미결제", "미입금", "입금대기", "링크대기"])
    );

  const paid =
    !canceled &&
    (
      isBankPaid(row) ||
      isCardPaid(row) ||
      includesAnyText(statusText, ["결제완료", "입금확인"])
    );

  const shipped =
    !canceled &&
    (
      Boolean(row.shipped_at) ||
      includesAnyText(statusText, ["출고완료", "배송완료"])
    );

  const ready =
    !canceled &&
    !shipped &&
    (
      paid ||
      includesAnyText(statusText, ["출고준비", "출고대기", "배송준비"])
    );

  if (canceled) addUnique(buckets, "canceled");
  if (unpaid) addUnique(buckets, "unpaid");
  if (paid) addUnique(buckets, "paid");
  if (ready) addUnique(buckets, "ready");
  if (shipped) addUnique(buckets, "shipped");

  if (buckets.length === 0) {
    addUnique(buckets, "unknown");
  }

  return buckets;
}
