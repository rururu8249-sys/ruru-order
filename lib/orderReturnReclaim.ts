// [2026-09-29] 반품 환불 시 «고른 수량 비율»만큼만 적립 포인트를 회수하기 위한 순수 계산.
//   2개 중 1개만 환불인데 줄 전체 금액으로 회수하던 과다 회수 버그를 막는다.
//   selectedQty 가 null 이면 «전체 수량»(기존 동작)과 동일하다.

/** 선택 수량 비율로 환산한 «회수 대상 금액» 합. rowAmount 는 그 줄의 (수량 전체) 금액을 준다. */
export function selectedEligibleAmount(
  rows: Array<Record<string, unknown>>,
  selectedQty: Record<string, number> | null,
  rowAmount: (r: Record<string, unknown>) => number,
): number {
  let sum = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const q = Math.max(1, Math.floor(Number((r as { qty?: unknown }).qty)) || 1);
    const key = String((r as { id?: unknown }).id ?? "");
    let p = q;
    if (selectedQty && Object.prototype.hasOwnProperty.call(selectedQty, key)) {
      p = Math.min(q, Math.max(1, Math.floor(Number(selectedQty[key])) || 1));
    }
    sum += (rowAmount(r) || 0) * p / q;
  }
  return sum;
}
