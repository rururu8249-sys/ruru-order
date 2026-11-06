// [2026-11-06 사장님 「장바구니 6일로 바꿨는데 그전에 담은 사람은 시간이 안 바뀜」]
// 유지시간 설정을 바꿔도 이미 담긴 줄의 만료(expires_at)는 손님이 다시 접속해야 새 시간으로 바뀐다(claim_cart_hold 가 처음 담은 시각 + 유지시간으로 다시 넣음).
// 관리자가 «지금 설정 시간»을 이미 담긴 장바구니에도 적용할 때 쓰는 계산. 늘리기만 한다(줄이면 오래 담긴 손님 장바구니가 한꺼번에 사라지므로).
// 표시용 선점 전용 — 주문·재고 차감·금액·입금·포인트 무관.

export function extendedHoldExpiry(createdAt: unknown, currentExpiresAt: unknown, holdMinutes: number, now: Date = new Date()): string | null {
  const created = new Date(String(createdAt ?? "")).getTime();
  const current = new Date(String(currentExpiresAt ?? "")).getTime();
  const minutes = Math.round(Number(holdMinutes));
  if (!Number.isFinite(created) || !Number.isFinite(current) || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (current <= now.getTime()) return null; // 이미 만료된 줄은 되살리지 않는다
  const next = created + minutes * 60_000;
  if (next <= current) return null; // 늘어날 때만
  return new Date(next).toISOString();
}
