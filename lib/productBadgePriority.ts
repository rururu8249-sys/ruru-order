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

// 원칙: 사장님이 «직접 고른» 배지가 자동 배지보다 위.
//   딱 하나 예외가 「🔥 N개 남음」 — 자동이지만 구체적 수치 + 긴급성이라 전환 효과가 가장 크다.
//   「🏆 N개 판매」도 강한 신호지만 자동이므로 수동 배지 아래에 둔다.
//   (자동 집계가 사장님이 의도적으로 단 ⚡특가·마감임박을 밀어내면 그건 매출 손해다)
export const BADGE_PROMO_ORDER = [
  "low",        // 🔥 N개 남음      — 희소성. 자동이지만 유일한 예외로 1순위
  "special",    // ⚡특가           (사장님 설정)
  "limit",      // 마감임박         (사장님 설정)
  "pick",       // 💖 루루픽        (사장님 설정)
  "holding",    // 지금 N명이 담는 중 — 실시간 장바구니 선점. «지금 경쟁자가 있다»는 가장 즉각적인 신호
  "liveSales",  // 방송 중 N개 주문 — 지금 이 방송에서 실제로 나간 수량(실시간)
  "recommend",  // 📌 추천          (사장님 고정)
  "repeat",     // 🔁 N명 재구매    — 자동. 단골 장사에서 가장 강한 증거(«다시 사는 사람이 있다»)
  "sold",       // 📈/🏆 N개 판매   — 자동. 사장님이 아무 배지도 안 단 상품에서 빛난다
  "hot",        // HOT             (수동 또는 실시간 담김 자동)
  "new",        // NEW             (수동 또는 등록 7일 이내 자동)
] as const;

/** 「🏆 N개 판매」를 붙이기 시작하는 누적 판매 수량.
 *
 *  [2026-09-20 실제 데이터로 확정] 루루동이 상품 696개의 누적 판매 분포
 *     1개 이상 358개(51.4%) / 5개 이상 128개(18.4%) / 10개 이상 76개(10.9%)
 *     20개 이상 43개(6.2%)  / 50개 이상 9개(1.3%)
 *  업계 권장은 «카탈로그의 15~25%에만 배지» (그 이상이면 손님이 배지를 안 보게 된다).
 *     → 5개 = 18.4% 로 권장 범위 한가운데. 1개(51%)는 너무 흔하고 10개(11%)는 너무 드물다.
 *  바꾸려면 이 숫자 하나만 고치면 된다. */
export const SOLD_BADGE_MIN_QTY = 5;

/** 「🔁 N명 재구매」를 붙이기 시작하는 «재구매 고객 수».
 *  재구매 판정은 재구매율 리포트와 같은 기준(kakao_id 우선·order_group_id 1건=1회·2건 이상).
 *  2명이면 이미 «우연»이 아니다. 실제 분포를 보고 올릴 수 있다. */
export const REPEAT_BADGE_MIN_BUYERS = 2;

/** 누적 대신 «최근 30일» 수치를 보여줄 기준.
 *  최근 실적이 있으면 그게 더 강한 신호라 같은 배지 자리에 최근 수치를 쓴다. */
export const SOLD_RECENT_MIN_QTY = 5;

/** 「제일 많이 팔린 상품」 자동 배지 기준 — products.sales_rank_pct (0 = 1등).
 *
 *  사장님 요청: «제일 많이 팔린 상품은 알아서 HOT? 루루픽? 추천? 뭐 알아서 붙이고»
 *  → 랜덤이 아니라 «판매 순위»라는 사실이므로 자동으로 붙인다.
 *
 *  판매 1개 이상인 상품끼리만 줄을 세운다(2026-09-20 기준 358개).
 *    상위 10% ≈ 36개  → HOT
 *    상위 3%  ≈ 11개  → 💖 루루픽 («사장님 대표상품»이라는 뜻을 지키려면 아주 적어야 한다)
 *  둘 다 «상품 속성»이 아니라 «성과»라 방송마다 자동으로 갈아탄다. */
/** 「🛒 방송 중 N개 주문」을 붙이기 시작하는 수량.
 *  방송 중에는 대부분 미입금이라 «주문 접수» 기준으로 센다(문구도 «주문»이라고 정확히 쓴다).
 *  2개는 우연일 수 있어 3개부터. 방송이 꺼져 있으면 «오늘» 기준으로 같은 배지가 붙는다. */
export const LIVE_SALES_MIN_QTY = 2;

/** 「지금 N명이 담는 중」을 붙이기 시작하는 «사람 수».
 *  cart_reservations(15분 선점)에서 «나를 뺀» 다른 손님 수를 센다 — 지어낸 숫자가 아니다.
 *  1명이면 «경쟁»이라 할 수 없어 2명부터. */
export const HOLDING_MIN_PEOPLE = 2;

export const HOT_AUTO_RANK_PCT = 0.10;
export const PICK_AUTO_RANK_PCT = 0.03;

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
