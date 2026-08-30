// scripts/test-order-phone.mjs
// 주문서 전화번호 정리 검증 — lib/order/phone.ts 의 실제 함수를 불러서 확인한다.
//
// 막으려는 사고 (2026-08-30 손님 김지영2231 문의)
//   "휴대폰 번호를 확인해 주세요. 01로 시작하는 10~11자리만 가능합니다." 가 계속 떴다.
//   국제형식(+82 10-1234-5678)이 들어오면 82 를 떼기 전에 11자리로 먼저 잘려
//   "82101234567" 이 되고 01 로 시작하지 않아 막혔다.
//   전화번호는 입금매칭·합배송·배송연락의 기준이라 여기서 막히면 주문 자체가 안 된다.
import { normalizeOrderPhone, formatOrderPhone, onlyOrderPhoneDigits } from "../lib/order/phone.ts";

let fail = 0;
const eq = (g, w, l) => { if (g === w) console.log(`✅ ${l} → "${g}"`); else { console.log(`❌ ${l}\n   나온값: "${g}"\n   기대값: "${w}"`); fail = 1; } };
// 주문서 제출 검증과 같은 규칙 (app/order/page.tsx:4364)
const PASSES = (v) => /^01[016789][0-9]{7,8}$/.test(normalizeOrderPhone(v));
const ok = (c, l) => { if (c) console.log(`✅ ${l}`); else { console.log(`❌ ${l}`); fail = 1; } };

console.log("── 사고 재발 방지 (국제형식) ──");
eq(normalizeOrderPhone("+82 10-1234-5678"), "01012345678", "카톡 국제형식");
eq(normalizeOrderPhone("+821012345678"), "01012345678", "국제형식 붙여쓰기");
eq(normalizeOrderPhone("8201012345678"), "01012345678", "82 + 010 (0 안 뺀 형태)");
eq(normalizeOrderPhone("0082-10-1234-5678"), "01012345678", "00 국제접속번호까지 붙은 형태");
ok(PASSES("+82 10-1234-5678"), "국제형식으로도 주문서 제출이 통과한다");

console.log("\n── 원래 되던 것 그대로 (회귀 확인) ──");
eq(normalizeOrderPhone("010-1234-5678"), "01012345678", "보통 입력");
eq(normalizeOrderPhone("01012345678"), "01012345678", "숫자만");
eq(normalizeOrderPhone("010 1234 5678"), "01012345678", "공백 포함");
eq(normalizeOrderPhone("011-234-5678"), "0112345678", "011 (10자리)");
eq(normalizeOrderPhone("019-1234-5678"), "01912345678", "019");
ok(PASSES("010-1234-5678") && PASSES("011-234-5678") && PASSES("019-1234-5678"), "휴대폰 번호들 전부 통과");

console.log("\n── 자릿수·표시 ──");
eq(normalizeOrderPhone("010123456789999"), "01012345678", "너무 길면 11자리로 자름");
eq(formatOrderPhone("01012345678"), "010-1234-5678", "화면 표시 형식");
eq(formatOrderPhone("0101234"), "010-1234", "입력 중간 단계도 안 깨짐");
eq(onlyOrderPhoneDigits(""), "", "빈 값");
eq(onlyOrderPhoneDigits("전화번호없음"), "", "글자만 있으면 빈 값");

console.log("\n── 휴대폰이 아닌 번호는 여전히 막힌다 (의도된 동작) ──");
ok(!PASSES("02-1234-5678"), "일반전화(02)는 막힘 — 입금매칭·배송연락이 깨지므로 의도된 제한");
ok(!PASSES("070-1234-5678"), "인터넷전화(070)도 막힘");
eq(normalizeOrderPhone("02-1234-5678"), "0212345678", "다만 숫자 정리 자체는 정상 (82 로 오인해 망가뜨리지 않는다)");
eq(normalizeOrderPhone("821234"), "821234", "82 로 시작해도 너무 짧으면 나라번호로 보지 않는다");

console.log(fail ? "\n주문서 전화번호 테스트 실패" : "\n주문서 전화번호 테스트 통과");
process.exit(fail);
