// [2026-10-27] 입금 「정리」·초과 입금 연결 — 화면·서버 공용 순수 규칙 (DB 무접촉)

export const DEPOSIT_SETTLE_STATUS = "처리완료";
export const DEPOSIT_SETTLE_PREFIX = "정리: ";
export const DEPOSIT_SETTLE_REASONS = ["인증(1원 등)", "중복 입금", "환불 끝", "기타"] as const;

type DepositLike = {
  match_status?: unknown;
  match_order_group_id?: unknown;
  match_customer_id?: unknown;
  confirmed_at?: unknown;
  confirmed_note?: unknown;
};

const text = (v: unknown) => String(v ?? "").trim();

/** 정리할 수 있는 입금 = 주문 연결 없음 + 확인시각 없음 + 상태 빈값/미확인/미매칭 */
export function isSettleableDeposit(row: DepositLike): boolean {
  if (text(row.match_order_group_id) || text(row.match_customer_id) || text(row.confirmed_at)) return false;
  const status = text(row.match_status);
  return status === "" || status === "미확인" || status === "미매칭";
}

/** 정리한 입금 = 상태 처리완료 + 메모 「정리:」 + 주문 연결 없음 */
export function isSettledDeposit(row: DepositLike): boolean {
  return (
    text(row.match_status) === DEPOSIT_SETTLE_STATUS &&
    text(row.confirmed_note).startsWith(DEPOSIT_SETTLE_PREFIX.trim()) &&
    !text(row.match_order_group_id)
  );
}

export function settledReason(row: DepositLike): string {
  return text(row.confirmed_note).replace(/^정리:\s*/, "");
}

/**
 * 입금매칭에서 «입금확인» 버튼을 켤지 — 고른 입금 합계 vs 주문 금액.
 *  · 같으면 OK
 *  · 주문서 1개이고 입금이 더 많으면 OK(초과 — 확인창 후 연결, 차액은 주문상세에서 포인트/환불)
 *  · 입금이 적거나, 여러 주문을 묶었는데 다르면 안 됨
 */
export function depositMatchDecision(selTotal: number, expected: number, multiOrder: boolean): "exact" | "over" | "blocked" {
  if (!(expected > 0) || !(selTotal > 0)) return "blocked";
  if (selTotal === expected) return "exact";
  if (!multiOrder && selTotal > expected) return "over";
  return "blocked";
}
