export type CartHoldSummaryRow = {
  session_key?: unknown;
  qty?: unknown;
};

export type CartHoldSummary = {
  cartCount: number;
  totalQty: number;
};

/**
 * 활성 장바구니 행을 고객 장바구니 수와 실제 상품 수량으로 집계한다.
 * 한 고객의 장바구니에 여러 상품 행이 있어도 cartCount는 한 번만 센다.
 */
export function buildCartHoldSummary(rows: CartHoldSummaryRow[]): CartHoldSummary {
  const sessions = new Set<string>();
  let totalQty = 0;

  for (const row of rows) {
    const sessionKey = String(row.session_key ?? "").trim();
    if (!sessionKey) continue;
    sessions.add(sessionKey);
    totalQty += Math.max(0, Math.floor(Number(row.qty) || 0));
  }

  return {
    cartCount: sessions.size,
    totalQty,
  };
}
