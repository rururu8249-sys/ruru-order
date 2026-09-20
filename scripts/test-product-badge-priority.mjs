import assert from "node:assert/strict";
import { pickVisibleBadges, MAX_PROMO_BADGES, SOLD_BADGE_MIN_QTY } from "../lib/productBadgePriority.ts";

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

// 🏆N개판매는 희소성(🔥) 바로 다음 — 사회적 증거라 특가·마감보다 위
{
  const v = pickVisibleBadges(["sold", "special", "limit", "new"]);
  assert.ok(has(v, "sold", "special"));
  assert.ok(!v.has("limit") && !v.has("new"));
}
{
  const v = pickVisibleBadges(["low", "sold", "pick"]);
  assert.ok(has(v, "low", "sold"), "희소성 + 사회적증거가 최우선 조합");
}

assert.equal(MAX_PROMO_BADGES, 2);
assert.ok(SOLD_BADGE_MIN_QTY >= 1);
console.log("✅ test-product-badge-priority 통과");
