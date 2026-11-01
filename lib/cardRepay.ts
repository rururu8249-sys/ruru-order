// lib/cardRepay.ts
// 2026-11-01 — 카드 주문 «일부 취소 → 남은 상품만 카드 다시 결제» 계산(표시용·순수 함수).
//   줄 금액 읽는 순서는 주문표 카드 금액(liveOrderAdapter getRowCardTotalAmount)과 같다: final → adjusted_total → total.
//   돈을 «저장»하지 않는다. 실제 금액은 줄을 지운 뒤 DB 를 다시 읽어 정한다(이 계산은 창 미리보기용).

export type CardRepayRow = {
  id: string;
  /** 이 줄 카드 결제 금액(상품+배송비+카드추가금−포인트) */
  total: number;
  /** 이 줄 카드추가금 */
  vat: number;
  /** 이 줄 배송비 — 지우면 주문상품 삭제 RPC 가 남는 줄로 옮긴다 */
  shipping: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** orders 한 줄 → 카드 다시 결제 계산용 */
export function cardRepayRowFrom(row: Record<string, unknown>): CardRepayRow {
  const total = num(row.final_amount ?? row.adjusted_total_price ?? row.total_price ?? 0);
  return {
    id: String(row.id ?? ""),
    total,
    vat: num(row.vat_amount ?? 0),
    shipping: num(row.adjusted_shipping_fee ?? row.shipping_fee ?? 0),
  };
}

export type CardRepayPlan = {
  originalTotal: number;
  removeTotal: number;
  /** 새로 받을 카드 결제금액(예상) — 빼는 줄 배송비는 남는 줄로 옮겨지므로 다시 더한다 */
  newTotal: number;
  newVat: number;
  movedShipping: number;
  keepCount: number;
  removeCount: number;
  /** 버튼을 못 누르는 이유(없으면 "") */
  blockReason: string;
};

export function planCardRepay(rows: CardRepayRow[], removeIds: Set<string>): CardRepayPlan {
  const keep = rows.filter((r) => !removeIds.has(r.id));
  const remove = rows.filter((r) => removeIds.has(r.id));
  const sum = (list: CardRepayRow[], k: keyof Omit<CardRepayRow, "id">) => list.reduce((s, r) => s + r[k], 0);
  const movedShipping = sum(remove, "shipping");
  const removeTotal = Math.max(0, sum(remove, "total") - movedShipping);
  const blockReason =
    rows.length === 0
      ? "주문 상품을 불러오는 중이에요"
      : remove.length === 0
        ? "뺄 상품을 골라 주세요"
        : keep.length === 0
          ? "전부 빼려면 주문 전체 취소를 쓰세요"
          : "";
  return {
    originalTotal: sum(rows, "total"),
    removeTotal,
    newTotal: sum(keep, "total") + movedShipping,
    newVat: sum(keep, "vat"),
    movedShipping,
    keepCount: keep.length,
    removeCount: remove.length,
    blockReason,
  };
}
