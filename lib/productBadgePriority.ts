// lib/productBadgePriority.ts
// 목적: 손님 상품카드 배지를 «몇 개까지 보여줄지» 한 곳에서 정한다.
// 주의: 표시 전용. 재고·금액·담기·배송비·입금 로직 없음.
//
// 왜 필요했나 (2026-09-20 실측)
// - 격자(2열)가 기본이 되면서 폰 420px에서 카드 폭이 167px.
//   배지 4개면 배지 줄만 42px(2줄), 5~6개면 3줄이 된다.
// - 업계 기준도 같은 방향: 「상품당 배지 1개, 카탈로그의 15~25%만」
//   (배지를 덕지덕지 붙이면 손님이 배지 자체를 안 보게 된다 — badge blindness)
//
// 우리 규칙
// - 정보 배지(info)는 «개수 제한 밖». 손님이 꼭 알아야 하는 사실이라 감추면 안 된다.
//   ✈️해외배송(배송 2~3주) / 🚚업체배송 / 🎁무료나눔 / 🛒바로구매(방송 중일 때만)
// - 마케팅 배지(promo)는 우선순위대로 최대 2개.
//   사장님이 직접 고른 배지를 자동 배지보다 위에 둔다.
//   단 「🔥 N개 남음」은 자동이지만 구체적 수치 + 긴급성이라 전환 효과가 가장 커서 1순위.

export const BADGE_PROMO_ORDER = [
  "low",        // 🔥 N개 남음 (재고 자동)
  "special",    // ⚡특가 (사장님 설정)
  "limit",      // 마감임박 (사장님 설정)
  "pick",       // 💖 루루픽 (사장님 설정)
  "recommend",  // 📌 추천 (사장님 고정)
  "sold",       // 🏆 N개 판매 (누적 판매 자동 — 도입 예정 자리)
  "hot",        // HOT
  "new",        // NEW
] as const;

export const BADGE_INFO_KEYS = ["free", "overseas", "company", "direct"] as const;

export type BadgeKey = string;

export const MAX_PROMO_BADGES = 2;

const promoRank = (key: BadgeKey) => {
  const i = (BADGE_PROMO_ORDER as readonly string[]).indexOf(key);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};

const isInfo = (key: BadgeKey) => (BADGE_INFO_KEYS as readonly string[]).includes(key);

/**
 * 켜져 있는 배지 key 목록을 받아, 화면에 실제로 그릴 key 집합을 돌려준다.
 * - 정보 배지는 전부 통과
 * - 마케팅 배지는 우선순위 상위 maxPromo 개만
 * 입력 순서는 결과에 영향을 주지 않는다(우선순위 표만 본다).
 */
export function pickVisibleBadges(activeKeys: BadgeKey[], maxPromo: number = MAX_PROMO_BADGES): Set<BadgeKey> {
  const uniq = Array.from(new Set(activeKeys.filter((k) => typeof k === "string" && k.trim() !== "")));
  const info = uniq.filter(isInfo);
  const promo = uniq
    .filter((k) => !isInfo(k))
    .sort((a, b) => promoRank(a) - promoRank(b))
    .slice(0, Math.max(0, maxPromo));
  return new Set([...info, ...promo]);
}
