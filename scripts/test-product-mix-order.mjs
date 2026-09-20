import assert from "node:assert/strict";
import { mixSeedForToday, mixKey, compareMixOrder } from "../lib/productMixOrder.ts";

// 씨앗은 한국시간 날짜 — 하루 동안 같고, 날이 바뀌면 달라진다
{
  const kstNoon = Date.UTC(2026, 8, 20, 3, 0, 0); // 2026-09-20 12:00 KST
  const kstLate = Date.UTC(2026, 8, 20, 14, 0, 0); // 같은 날 23:00 KST
  const nextDay = Date.UTC(2026, 8, 20, 15, 30, 0); // 2026-09-21 00:30 KST
  assert.equal(mixSeedForToday(kstNoon), 20260920);
  assert.equal(mixSeedForToday(kstLate), 20260920, "같은 날이면 씨앗이 같아야 한다");
  assert.equal(mixSeedForToday(nextDay), 20260921, "자정이 지나면 다시 섞인다");
}

// 같은 (id, seed)는 항상 같은 값 — 새로고침해도 순서가 안 흔들린다
{
  assert.equal(mixKey(56, 20260920), mixKey(56, 20260920));
  assert.equal(mixKey("56", 20260920), mixKey(56, 20260920), "숫자든 문자든 같은 id면 같은 자리");
  assert.notEqual(mixKey(56, 20260920), mixKey(56, 20260921), "날이 바뀌면 자리도 바뀐다");
}

// 정렬이 결정적이고, 실제로 골고루 섞인다
{
  const ids = Array.from({ length: 60 }, (_, i) => i + 1);
  const seed = 20260920;
  const run = () => [...ids].sort((a, b) => compareMixOrder(a, b, seed));
  const first = run();
  assert.deepEqual(run(), first, "같은 날 같은 순서");

  // 원래 순서와 충분히 달라야 «골고루»라 할 수 있다
  const samePosition = first.filter((id, i) => id === ids[i]).length;
  assert.ok(samePosition < 10, `너무 안 섞였다(제자리 ${samePosition}개)`);

  // 날이 바뀌면 순서가 달라진다
  const next = [...ids].sort((a, b) => compareMixOrder(a, b, 20260921));
  assert.notDeepEqual(next, first);
}

// 빈 값·중복 방어 — 순서가 뒤집히거나 터지지 않는다
{
  assert.equal(compareMixOrder(null, null, 1), 0);
  assert.ok(Number.isFinite(mixKey(undefined, 1)));
}

console.log("✅ test-product-mix-order 통과");
