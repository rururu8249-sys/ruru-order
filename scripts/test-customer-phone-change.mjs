// [2026-08-30] 회원 전화번호 변경 — 판단 규칙 시뮬레이션 검사
//
// 전화번호는 포인트 · 합배송 택배비 · 무통장 자동입금확인의 기준(식별키)이다.
// 여기서 잘못 통과시키면 남의 주문이 딸려오거나 택배비가 다시 붙는다.
// 그래서 화면을 눌러보지 않아도 규칙이 맞는지 여기서 확인한다.

import assert from "node:assert";
import {
  conflictMessage,
  phoneDigits,
  phoneVariants,
  validateNewPhone,
} from "../lib/customerPhoneChange.ts";

let pass = 0;
const ok = (label) => { pass += 1; console.log("  ✓ " + label); };

console.log("\n[1] 실제로 있었던 교정 건은 통과해야 한다");
assert.equal(validateNewPhone("01088724389", "010-8383-4389").ok, true);  // 히무0
assert.equal(validateNewPhone("01033995209", "01028495209").ok, true);    // 루루짱929
ok("히무0 · 루루짱929 교정 번호 통과 (하이픈 있어도 됨)");

console.log("\n[2] 막아야 하는 것");
assert.equal(validateNewPhone("01088724389", "").ok, false);
ok("빈 번호는 막는다");
assert.equal(validateNewPhone("01088724389", "0108872438").ok, true);   // 10자리 허용
assert.equal(validateNewPhone("01088724389", "010887").ok, false);
ok("10자리 미만은 막는다");
assert.equal(validateNewPhone("01088724389", "010887243891234").ok, false);
ok("11자리 초과는 막는다");
assert.equal(validateNewPhone("01088724389", "010-8872-4389").ok, false);
ok("같은 번호를 다시 넣으면 막는다 (하이픈만 다른 것도 같은 번호로 본다)");
assert.equal(validateNewPhone("", "01083834389").ok, false);
ok("지금 번호를 모르면 막는다");

console.log("\n[3] 일반전화 손님도 받아준다");
assert.equal(validateNewPhone("01088724389", "0212345678").ok, true);
ok("02 지역번호 10자리 통과 (010 강제하지 않는다)");

console.log("\n[4] 옛 주문 매칭 후보 (하이픈 주문 누락 방지)");
assert.deepEqual(phoneVariants("01083834389"), ["01083834389", "010-8383-4389"]);
// [2026-08-31] 서울(02) 번호는 새 표기 02-1234-5678 변형도 만든다 (2026-08-30 일반전화 작업 반영)
assert.deepEqual(phoneVariants("0212345678"), ["0212345678", "021-234-5678", "02-1234-5678"]);
assert.deepEqual(phoneVariants(""), []);
ok("숫자형·하이픈형을 둘 다 만든다 (옛 주문이 안 걸리는 일 방지)");

console.log("\n[5] 번호 재사용 차단 — 여기가 제일 위험한 지점");
const owners = [{ id: 1819, youtube_nickname: "루루짱929", customer_name: "민연숙" }];
assert.ok(conflictMessage(owners, 9999).includes("루루짱929"), "다른 회원이 쓰면 막아야 한다");
ok("그 번호를 쓰는 다른 회원이 있으면 이름과 함께 거부한다");

assert.equal(conflictMessage(owners, 1819), "", "본인 줄은 충돌이 아니다");
ok("본인 줄은 충돌로 보지 않는다 (자기 번호 재저장 허용)");

assert.equal(conflictMessage([], 1819), "");
assert.equal(conflictMessage(undefined, 1819), "");
ok("쓰는 사람이 없으면 통과 · 값이 없어도 터지지 않는다");

const noName = [{ id: 7, youtube_nickname: "", customer_name: "" }];
assert.ok(conflictMessage(noName, 1).includes("다른 회원"));
ok("이름이 비어 있어도 안내 문구가 깨지지 않는다");

console.log("\n[6] 숫자만 남기기");
assert.equal(phoneDigits(" 010-8383-4389 "), "01083834389");
assert.equal(phoneDigits(null), "");
ok("공백·하이픈·빈값 처리");

console.log(`\ntest-customer-phone-change: 통과 (${pass}개 항목)\n`);
