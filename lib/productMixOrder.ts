// lib/productMixOrder.ts
// 목적: 손님 상품목록 「골고루 보기」 정렬.
//
// 사장님 요청: «잘 안 팔리는 상품도, 한 개도 안 팔린 상품도 노출은 되고 관심을 갖게 해야 하니»
//   배지만으로는 한계가 있다 — 목록 «뒤쪽»에 있으면 배지를 뭘 붙여도 손님이 못 본다.
//   큰 쇼핑몰들은 여기에 «탐색(exploration) 자리»를 둬서 실적 없는 상품에도 노출 기회를 준다.
//   (constructor.com/blog/cold-start-products — 판매 이력 없는 상품을 surfacing 하는 방식)
//
// 왜 «완전 무작위»가 아닌가
//   새로고침할 때마다 순서가 바뀌면 손님이 «아까 본 그 상품»을 못 찾는다.
//   → 한국시간 «날짜»를 씨앗으로 쓴다. 하루 동안은 순서가 고정되고, 날이 바뀌면 다시 섞인다.
//     모든 상품이 «언젠가는» 위에 올 기회를 갖되, 쓰는 동안은 흔들리지 않는다.
//
// 주의: 표시 «순서»만 바꾼다. DB의 sort_order·is_pinned, 재고·금액·담기와 무관.

/** 한국시간 기준 오늘 날짜(YYYYMMDD)를 정수 씨앗으로. 자정에 한 번 바뀐다. */
export function mixSeedForToday(nowMs: number = Date.now()): number {
  const kst = new Date(nowMs + 9 * 60 * 60 * 1000);
  return kst.getUTCFullYear() * 10000 + (kst.getUTCMonth() + 1) * 100 + kst.getUTCDate();
}

/**
 * 상품 하나의 «섞인 자리»를 정하는 값. 같은 (id, seed)면 항상 같은 값이 나온다.
 * FNV-1a 계열 32비트 해시 — 짧고, 비슷한 id끼리도 값이 멀리 흩어진다.
 */
export function mixKey(productId: unknown, seed: number): number {
  const s = `${String(productId ?? "")}#${Math.trunc(seed)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 「골고루 보기」 비교 함수. 같은 날이면 순서가 고정된다. */
export function compareMixOrder(aId: unknown, bId: unknown, seed: number): number {
  const ka = mixKey(aId, seed);
  const kb = mixKey(bId, seed);
  if (ka !== kb) return ka - kb;
  // 해시가 같은 아주 드문 경우에도 순서가 흔들리지 않게 id 문자열로 확정한다
  return String(aId ?? "").localeCompare(String(bId ?? ""));
}
