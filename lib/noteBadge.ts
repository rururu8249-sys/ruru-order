// [2026-09-20] 안 읽은 쪽지·공지 배지 숫자 규칙 (표시 전용).
//   근거: Material Design 3 「Badge」 specs — large badge 최대 글자수 컨테이너 16×34dp
//   (m3.material.io/components/badges/specs, 2026-09-20 확인) → 세 글자까지 들어간다.
//   99까지는 숫자 그대로, 넘으면 「99+」. 예전엔 9를 넘으면 전부 「9+」라 12건이 9+로 보였다.
export function noteBadgeText(count: unknown): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n > 99 ? "99+" : String(n);
}
