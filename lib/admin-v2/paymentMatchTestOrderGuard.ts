// lib/admin-v2/paymentMatchTestOrderGuard.ts
// 목적: 운영자 테스트 주문을 Bankda/자동입금확인/수동입금확인 후보에서 제외합니다.
// 주의: 실제 입금내역(deposits), 주문금액, 정산, 송장, 피킹 로직은 변경하지 않습니다.

function truthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (value === 1) return true;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y";
  }

  return false;
}

export function isPaymentMatchExcludedOrder(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;

  const row = order as Record<string, unknown>;

  return truthyFlag(row.exclude_from_payment_match) || truthyFlag(row.is_test_order);
}

export function filterPaymentMatchEligibleOrders<T>(orders: T[] | null | undefined): T[] {
  if (!Array.isArray(orders)) return [];

  return orders.filter((order) => !isPaymentMatchExcludedOrder(order));
}
