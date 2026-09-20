import assert from "node:assert/strict";
import { pickVisibleBadges, MAX_PROMO_BADGES, SOLD_BADGE_MIN_QTY, REPEAT_BADGE_MIN_BUYERS, SOLD_RECENT_MIN_QTY } from "../lib/productBadgePriority.ts";

const has = (s, ...k) => k.every((x) => s.has(x));

// 사장님 캡쳐 실제 사례 ①: 룰루레몬 — 마감임박 + 🔥5개남음 + 💖루루픽 (방송OFF라 바로구매 제거됨)
{
  const v = pickVisibleBadges(["limit", "low", "pick"]);
  assert.equal(v.size, 2, "마케팅 배지는 2개까지");
  assert.ok(has(v, "low", "limit"), "🔥N개남음 → 마감임박 순으로 살아남아야 한다");
  assert.ok(!v.has("pick"), "루루픽은 3순위라 잘린다");
}

// 사장님 캡쳐 실제 사례 ②: 알로가방 — NEW + HOT + 💖루루픽
{
  const v = pickVisibleBadges(["new", "hot", "pick"]);
  assert.equal(v.size, 2);
  assert.ok(has(v, "pick", "hot"), "사장님이 고른 루루픽이 자동 HOT/NEW보다 우선");
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

// 🏆N개판매(자동)는 사장님이 «직접 고른» 배지를 밀어내면 안 된다
{
  const v = pickVisibleBadges(["sold", "special", "limit", "new"]);
  assert.ok(has(v, "special", "limit"), "사장님이 단 ⚡특가·마감임박이 자동 🏆보다 위");
  assert.ok(!v.has("sold"), "자동 배지는 수동 배지에 밀린다");
}
// 사장님이 아무 배지도 안 단 상품에서 🏆가 빛난다
{
  const v = pickVisibleBadges(["sold", "hot", "new"]);
  assert.ok(has(v, "sold", "hot"));
  assert.ok(!v.has("new"));
}
// 🔥N개남음만은 자동이어도 1순위 (유일한 예외)
{
  const v = pickVisibleBadges(["low", "special", "sold"]);
  assert.ok(has(v, "low", "special"));
}

// 사장님이 배지를 «하나도 안 단» 상품 — 통계 배지만으로도 두 칸이 채워져야 한다
{
  const v = pickVisibleBadges(["repeat", "sold", "hot", "new"]);
  assert.ok(has(v, "repeat", "sold"), "재구매 → 판매수 순으로 자동 배지가 채운다");
  assert.equal(v.size, 2);
}
// 재구매(자동)도 사장님 수동 배지는 밀어내지 못한다
{
  const v = pickVisibleBadges(["repeat", "special", "pick"]);
  assert.ok(has(v, "special", "pick"));
  assert.ok(!v.has("repeat"));
}

assert.equal(MAX_PROMO_BADGES, 2);
// 실제 데이터(상품 696개) 기준 5개이상=128개=18.4% → 업계 권장 15~25% 안
assert.equal(SOLD_BADGE_MIN_QTY, 5);
assert.equal(SOLD_RECENT_MIN_QTY, 5);
assert.ok(REPEAT_BADGE_MIN_BUYERS >= 2, "1명이면 «재구매 많음»이라 할 수 없다");
console.log("✅ test-product-badge-priority 통과");
