// 알림음 중복 차단 규칙 검수 — 「입금 소리가 두 번 연속」 재발 방지
import assert from "node:assert/strict";
import { shouldPlayAlert, ALERT_SAME_KEY_WINDOW_MS, DEPOSIT_KIND_COOLDOWN_MS } from "../lib/alertDedupe.ts";

const T = 1_000_000;

// 처음이면 울린다
assert.equal(shouldPlayAlert({ now: T, lastSameKeyAt: null, lastKindAt: null }), true);

// 같은 건(탭 2개)이 3초 안에 또 오면 막는다
assert.equal(shouldPlayAlert({ now: T + 1000, lastSameKeyAt: T, lastKindAt: T }), false);
assert.equal(shouldPlayAlert({ now: T + ALERT_SAME_KEY_WINDOW_MS + 1, lastSameKeyAt: T, lastKindAt: null }), true);

// ★ 한 입금이 주문 2건을 확인시켜 폴링이 나눠 읽은 경우 — id 가 달라도(lastSameKeyAt=null) 4초 안이면 막는다
assert.equal(
  shouldPlayAlert({ now: T + 1500, lastSameKeyAt: null, lastKindAt: T, kindCooldownMs: DEPOSIT_KIND_COOLDOWN_MS }),
  false,
  "같은 입금이 갈라져 들어와도 한 번만 울려야 한다",
);
// 4초가 지난 «진짜 다음 입금»은 울린다
assert.equal(
  shouldPlayAlert({ now: T + DEPOSIT_KIND_COOLDOWN_MS + 1, lastSameKeyAt: null, lastKindAt: T, kindCooldownMs: DEPOSIT_KIND_COOLDOWN_MS }),
  true,
  "다음 입금은 반드시 울려야 한다(놓치면 돈 사고)",
);

// 주문 알림은 종류 가드 없음(kindCooldownMs 0) — 손님이 2초 간격으로 주문해도 각각 울린다
assert.equal(shouldPlayAlert({ now: T + 2000, lastSameKeyAt: null, lastKindAt: T, kindCooldownMs: 0 }), true);

// 시계가 거꾸로 간 기록(미래 값)은 무시하고 울린다 — 조용해지는 쪽이 더 위험
assert.equal(shouldPlayAlert({ now: T, lastSameKeyAt: T + 60000, lastKindAt: null }), true);

// 망가진 값
assert.equal(shouldPlayAlert({ now: T, lastSameKeyAt: NaN, lastKindAt: null }), true);

console.log("✅ alert-dedupe 통과");
