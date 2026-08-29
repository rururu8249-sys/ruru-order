// [2026-08-30] 포인트 중복지급 차단 키 — 시뮬레이션 검사
//
// 왜 필요한가 (실제 사고)
//   2026-08-29 16:58 서바이벌에서 「쩡이」에게 2,000P 가 두 번 나갔다.
//     쩡이       지급 16:58:39.98 → 잠금 16:59:24.90 (44.9초)  ❌
//     개구쟁쟁이  지급 16:58:41.93 → 잠금 16:58:42.63 (0.7초)  ✓
//   당첨자 줄은 하나뿐이었다. 첫 지급 뒤 화면 잠금이 실패한 44초 사이 재실행돼 또 나갔다.
//   2026-07-05 쥬쥬엉니 2,000P 와 같은 원인.
//
// 그래서 이제 "돈이 나가는 서버"에서 막는다. 그 키가 제대로 만들어지는지 여기서 확인한다.

import assert from "node:assert";
import {
  buildCustomerPointLedgerPayload,
  buildPointSourceKey,
  normalizePointSourceKey,
} from "../lib/customerPoints.ts";

let pass = 0;
const ok = (label) => { pass += 1; console.log("  ✓ " + label); };

const change = { action: "grant", changeType: "grant", signedAmount: 2000, requestedAmount: 2000, nextPoints: 2000 };
const base = { id: "led-1", phone: "01084351421", change, reason: "포인트 2,000P" };

console.log("\n[1] 당첨자 줄마다 서로 다른 키가 나와야 한다");
const 쩡이 = buildPointSourceKey("event_winner", "a95de4c8-a39d-4fe9-9b1d-d8145176d5f2");
const 개구 = buildPointSourceKey("event_winner", "8af4cb8f-0ef7-48b0-ac08-3330fefc3f8a");
assert.equal(쩡이, "event_winner:a95de4c8-a39d-4fe9-9b1d-d8145176d5f2");
assert.notEqual(쩡이, 개구);
ok("실제 사고 당첨자 3명의 키가 서로 다르다 (한 명 지급이 다른 사람을 막지 않는다)");

console.log("\n[2] 같은 당첨자 줄은 몇 번을 만들어도 같은 키 — DB 가 두 번째를 거부한다");
assert.equal(buildPointSourceKey("event_winner", "a95de4c8"), buildPointSourceKey("event_winner", "a95de4c8"));
ok("재실행·새로고침·다른 탭에서 다시 눌러도 키가 동일하다");

console.log("\n[3] 원장에 실제로 실린다");
const withKey = buildCustomerPointLedgerPayload({ ...base, sourceKey: 쩡이 });
assert.equal(withKey.source_key, 쩡이);
assert.equal(withKey.amount, 2000);
assert.equal(withKey.balance_after, 2000);
ok("source_key 가 원장 payload 에 들어가고 금액 계산은 그대로다");

console.log("\n[4] 기존 흐름은 절대 막히면 안 된다 (수동지급 · 주문 자동적립)");
const noKey = buildCustomerPointLedgerPayload(base);
assert.equal(noKey.source_key, null, "키가 없으면 NULL 이어야 부분 유니크 인덱스가 안 걸린다");
const emptyKey = buildCustomerPointLedgerPayload({ ...base, sourceKey: "   " });
assert.equal(emptyKey.source_key, null);
ok("키를 안 주거나 공백이면 NULL → 여러 번 지급 가능 (기존 동작 유지)");

console.log("\n[5] 잘못된 값 방어");
assert.equal(buildPointSourceKey("event_winner", ""), "");
assert.equal(buildPointSourceKey("", "abc"), "");
assert.equal(buildPointSourceKey("event_winner", null), "");
ok("id 나 종류가 비면 키를 만들지 않는다 (엉뚱한 키로 남의 지급을 막지 않게)");

assert.equal(buildPointSourceKey("event winner!@#", "abc"), "eventwinner:abc");
ok("종류 이름의 이상한 문자는 걸러낸다");

const long = buildPointSourceKey("event_winner", "x".repeat(500));
assert.ok(long.length <= 200);
assert.ok(normalizePointSourceKey("y".repeat(500)).length <= 200);
ok("아주 긴 값은 200자로 자른다");

console.log("\n[6] 사고 재현 — 같은 당첨자에게 두 번 시도");
const first = buildCustomerPointLedgerPayload({ ...base, id: "led-1", sourceKey: 쩡이 });
const second = buildCustomerPointLedgerPayload({ ...base, id: "led-2", sourceKey: 쩡이 });
assert.equal(first.source_key, second.source_key);
assert.notEqual(first.id, second.id);
ok("원장 id 는 달라도 source_key 가 같다 → DB 유니크가 두 번째를 거부한다");

console.log(`\ntest-point-source-key: 통과 (${pass}개 항목)\n`);
