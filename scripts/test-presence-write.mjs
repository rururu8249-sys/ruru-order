// [2026-08-29] 접속 신호 저장 — 입력 검증 시뮬레이션
//
// 왜 필요한가
//   /api/presence 는 손님도 부를 수 있는 "공개" 주소가 됐다.
//   아무 값이나 들어와서 가짜 접속이 쌓이거나, 반대로 진짜 손님이 막히면 안 된다.
//   실제 화면(PresenceHeartbeat)이 만드는 키가 통과하는지 여기서 확인한다.

import assert from "node:assert";
import { normalizePresenceInput } from "../lib/presenceWrite.ts";

let pass = 0;
const ok = (label) => { pass += 1; console.log("  ✓ " + label); };

console.log("\n[1] 진짜 손님 브라우저가 만드는 키는 반드시 통과해야 한다");
// components/PresenceHeartbeat.tsx 의 getOrCreateVisitorKey 가 만드는 두 가지 형태
const uuid = "550e8400-e29b-41d4-a716-446655440000";           // crypto.randomUUID()
const fallback = "visitor-1756480000000-a1b2c3d4";              // 구형 브라우저 대체값
for (const key of [uuid, fallback]) {
  const r = normalizePresenceInput({ visitorKey: key, pageType: "order_form", path: "/order" });
  assert.equal(r.valid, true, "손님 키가 막히면 접속자가 또 0명이 된다: " + key);
}
ok("randomUUID / 구형 대체값 둘 다 통과");

console.log("\n[2] 페이지 종류가 제대로 분류되는가");
assert.equal(normalizePresenceInput({ visitorKey: uuid, pageType: "order_form" }).pageType, "order_form");
assert.equal(normalizePresenceInput({ visitorKey: uuid, pageType: "order_lookup" }).pageType, "order_lookup");
assert.equal(normalizePresenceInput({ visitorKey: uuid, pageType: "admin" }).pageType, "admin");
assert.equal(normalizePresenceInput({ visitorKey: uuid, pageType: "group_buy" }).pageType, "group_buy");
ok("주문서·주문조회·관리자·공구 그대로 유지");

assert.equal(normalizePresenceInput({ visitorKey: uuid, pageType: "이상한값" }).pageType, "page");
assert.equal(normalizePresenceInput({ visitorKey: uuid }).pageType, "page");
ok("모르는 값은 기타(page)로 정리 — 통계가 오염되지 않는다");

console.log("\n[3] 막아야 하는 것");
assert.equal(normalizePresenceInput({ visitorKey: "" }).valid, false);
ok("빈 키는 막는다");
assert.equal(normalizePresenceInput({ visitorKey: "abc" }).valid, false);
ok("너무 짧은 키는 막는다 (8자 미만)");
assert.equal(normalizePresenceInput({ visitorKey: "x".repeat(200) }).valid, false);
ok("너무 긴 키는 막는다 (80자 초과)");
assert.equal(normalizePresenceInput({ visitorKey: "abcdefgh'; drop table" }).valid, false);
ok("따옴표·공백 섞인 키는 막는다");

console.log("\n[4] 길이 자르기 (DB 부담 방지)");
const long = normalizePresenceInput({
  visitorKey: uuid,
  path: "/order?" + "a".repeat(500),
  nickname: "닉".repeat(100),
});
assert.ok(long.path.length <= 200, "경로는 200자까지");
assert.ok(long.nickname.length <= 40, "닉네임은 40자까지");
ok("긴 경로·닉네임은 잘라서 저장한다");

console.log("\n[5] 공백 정리");
const trimmed = normalizePresenceInput({ visitorKey: `  ${uuid}  `, nickname: "  숨숨  " });
assert.equal(trimmed.valid, true);
assert.equal(trimmed.visitorKey, uuid);
assert.equal(trimmed.nickname, "숨숨");
ok("앞뒤 공백은 지운다");

console.log(`\ntest-presence-write: 통과 (${pass}개 항목)\n`);
