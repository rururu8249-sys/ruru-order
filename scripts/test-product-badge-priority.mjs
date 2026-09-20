import assert from "node:assert/strict";
import { pickVisibleBadges, MAX_PROMO_BADGES, REPEAT_BADGE_MIN_BUYERS, SOLD_RECENT_MIN_QTY, HOLDING_MIN_PEOPLE, TOP_SELLER_RANK_PCT, POPULAR_RANK_PCT } from "../lib/productBadgePriority.ts";

const has = (s, ...k) => k.every((x) => s.has(x));

// 사장님 캡쳐 실제 사례 ①: 룰루레몬 — 마감임박 + 🔥5개남음 + 💖루루픽 (방송OFF라 바로구매 제거됨)
{
  const v = pickVisibleBadges(["limit", "low", "pick"]);
  assert.equal(v.size, 2, "마케팅 배지는 2개까지");
  assert.ok(has(v, "low", "limit"), "🔥N개남음 → 마감임박 순으로 살아남아야 한다");
  assert.ok(!v.has("pick"), "루루픽은 3순위라 잘린다");
}

// 사장님 캡쳐 실제 사례 ②: 알로가방 — 신상 + 인기 + 💖루루픽
{
  const v = pickVisibleBadges(["new", "hot", "pick"]);
  assert.equal(v.size, 2);
  assert.ok(has(v, "pick", "hot"), "사장님이 고른 루루픽이 자동 인기/신상보다 우선");
  assert.ok(!v.has("new"));
}

// 정보 배지는 개수 제한 밖 — 감추면 안 되는 사실
{
  const v = pickVisibleBadges(["overseas", "low", "limit", "special", "pick", "new", "hot"]);
  assert.ok(v.has("overseas"), "해외배송은 배송기간 때문에 항상 보여야 한다");
  assert.equal(v.size, 3, "정보 1 + 마케팅 2");
}
{
  const v = pickVisibleBadges(["free", "company", "direct", "new"]);
  assert.equal(v.size, 4, "정보 3개는 전부 + 마케팅 1개");
  assert.ok(has(v, "free", "company", "direct", "new"));
}

// 입력 순서가 결과를 바꾸면 안 된다
{
  const a = [...pickVisibleBadges(["new", "low", "special"])].sort();
  const b = [...pickVisibleBadges(["special", "new", "low"])].sort();
  assert.deepEqual(a, b);
}

// 빈 값·중복 방어
{
  assert.equal(pickVisibleBadges([]).size, 0);
  assert.equal(pickVisibleBadges(["low", "low", "", "  "]).size, 1);
}

// 모르는 배지는 맨 뒤로 (있던 배지가 갑자기 사라지지 않게 최소한 뒤에 줄은 선다)
{
  const v = pickVisibleBadges(["unknown_new_badge", "low"]);
  assert.ok(v.has("low"));
  assert.ok(v.has("unknown_new_badge"), "2개까지는 통과");
}

// 통계 배지(자동)는 사장님이 «직접 고른» 배지를 밀어내면 안 된다
{
  const v = pickVisibleBadges(["topSeller", "special", "limit", "new"]);
  assert.ok(has(v, "special", "limit"), "사장님이 단 특가·마감임박이 자동 최다판매보다 위");
  assert.ok(!v.has("topSeller"));
}
// 사장님이 아무 배지도 안 단 상품에서 통계 배지가 두 칸을 채운다
{
  const v = pickVisibleBadges(["topSeller", "trending", "hot", "new"]);
  assert.ok(has(v, "topSeller", "trending"));
  assert.ok(!v.has("new"));
}
// 「N개 남음」만은 자동이어도 1순위 (유일한 예외)
{
  const v = pickVisibleBadges(["low", "special", "topSeller"]);
  assert.ok(has(v, "low", "special"));
}

// 사장님이 배지를 «하나도 안 단» 상품 — 통계 배지만으로도 두 칸이 채워져야 한다
{
  const v = pickVisibleBadges(["repeat", "trending", "hot", "new"]);
  assert.ok(has(v, "repeat", "trending"), "재구매 → 요즘잘나가요 순으로 자동 배지가 채운다");
  assert.equal(v.size, 2);
}
// 재구매(자동)도 사장님 수동 배지는 밀어내지 못한다
{
  const v = pickVisibleBadges(["repeat", "special", "pick"]);
  assert.ok(has(v, "special", "pick"));
  assert.ok(!v.has("repeat"));
}

// 방송 중 실시간 판매 배지는 수동 배지보다 아래, 재구매·누적판매보다 위
{
  const v = pickVisibleBadges(["liveSales", "repeat", "sold"]);
  assert.ok(has(v, "liveSales", "repeat"), "방송 중 실시간 수량이 누적보다 강한 신호");
  assert.ok(!v.has("sold"));
}
{
  const v = pickVisibleBadges(["liveSales", "special", "pick"]);
  assert.ok(has(v, "special", "pick"), "자동 배지는 사장님 수동 배지를 밀어내지 않는다");
}
{
  const v = pickVisibleBadges(["low", "liveSales", "sold"]);
  assert.ok(has(v, "low", "liveSales"), "실재고 + 방송 중 수량이 최강 조합");
}

// 「여러 명이 담는 중」 — 실시간 선점. 자동 배지 중 가장 즉각적이라 위
{
  const v = pickVisibleBadges(["holding", "topSeller", "trending"]);
  assert.ok(has(v, "holding", "topSeller"));
  assert.ok(!v.has("trending"));
}
{
  const v = pickVisibleBadges(["holding", "special", "limit"]);
  assert.ok(has(v, "special", "limit"), "자동 배지는 사장님 수동 배지를 밀어내지 않는다");
}
// 상위 3%는 「최다판매」, 3~10%는 「인기」 — 겹치지 않는다
{
  const v = pickVisibleBadges(["topSeller", "repeat", "hot", "new"]);
  assert.ok(has(v, "topSeller", "repeat"));
}
// 기준선 — 낮은 숫자를 띄우면 오히려 «인기 없는 상품»으로 읽힌다(negative social proof)
assert.ok(HOLDING_MIN_PEOPLE >= 3, "2명은 «여러 명»이라 하기 어렵다");
// 숫자를 화면에 안 쓰는 배지는 기준을 후하게 — 자랑거리 없는 상품을 줄인다
assert.ok(POPULAR_RANK_PCT >= 0.2, "「인기」는 넓게 잡아야 소외가 줄어든다");
assert.ok(TOP_SELLER_RANK_PCT < POPULAR_RANK_PCT, "최다판매가 인기보다 좁아야 한다");
assert.ok(SOLD_RECENT_MIN_QTY >= 5);
assert.ok(REPEAT_BADGE_MIN_BUYERS >= 2);
assert.equal(MAX_PROMO_BADGES, 2);

console.log("✅ test-product-badge-priority 통과");
