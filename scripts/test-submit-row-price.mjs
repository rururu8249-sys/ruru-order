// 주문 저장 API 금액 읽기 규칙 검수 — adjusted_product_price 는 줄 합계다
import assert from "node:assert/strict";
import { submitRowQty, submitRowLineTotal, submitRowUnitPriceForCheck } from "../lib/submitRowPrice.ts";
import { registeredProductSubmittedPriceValid } from "../lib/registeredProductPricePolicy.ts";

// 손님 화면 payload 그대로: 단가 10,000 × 6개
const six = { qty: 6, product_price: 10000, adjusted_product_price: 60000 };
assert.equal(submitRowQty(six), 6);
assert.equal(submitRowLineTotal(six), 60000, "줄 합계는 adjusted_product_price 그대로(×수량 다시 안 곱함)");
assert.equal(submitRowUnitPriceForCheck(six), 10000, "검증 단가 = 줄 합계 ÷ 수량");

// 예전 버그 재현 방지: 줄 합계 × 수량 = 360,000 이 되면 안 된다
assert.notEqual(submitRowLineTotal(six) * 1, 360000);

// adjusted 없음(옛 payload) → 단가 × 수량
assert.equal(submitRowLineTotal({ qty: 3, product_price: 15000 }), 45000);
assert.equal(submitRowUnitPriceForCheck({ qty: 3, product_price: 15000 }), 15000);

// 문자열·쉼표 값도 읽는다
assert.equal(submitRowLineTotal({ qty: "2", product_price: "29,000", adjusted_product_price: "58,000" }), 58000);
assert.equal(submitRowUnitPriceForCheck({ qty: "2", product_price: "29,000", adjusted_product_price: "58,000" }), 29000);

// 조합형 추가금: 단가(기본 25,000 + 추가금 3,000) × 2
assert.equal(submitRowUnitPriceForCheck({ qty: 2, product_price: 28000, adjusted_product_price: 56000 }), 28000);

// ── 검증(B) — 카탈로그 단가 20,000, 하한 0.5 ──
const ok = (row, expected = 20000, mode = "fixed") => registeredProductSubmittedPriceValid(mode, submitRowUnitPriceForCheck(row), expected, 0.5);
assert.equal(ok({ qty: 3, product_price: 20000, adjusted_product_price: 60000 }), true, "수량 3개 정상 주문 통과");
assert.equal(ok({ qty: 1, product_price: 20000, adjusted_product_price: 20000 }), true, "수량 1개 정상 통과");
assert.equal(ok({ qty: 3, product_price: 20000, adjusted_product_price: 30000 }), true, "개당 10,000 = 하한(절반) 경계는 통과");
assert.equal(ok({ qty: 3, product_price: 20000, adjusted_product_price: 29999 }), false, "줄 합계 조작(개당 9,999) 차단");
assert.equal(ok({ qty: 4, product_price: 20000, adjusted_product_price: 39996 }), false, "4개인데 줄 합계 39,996(개당 9,999) 차단 — 예전 코드는 39,996 ≥ 10,000 이라 통과시켰다");
assert.equal(ok({ qty: 2, product_price: 5000, adjusted_product_price: 40000 }), false, "단가 칸만 낮게 조작해도 차단(둘 중 작은 쪽)");
assert.equal(ok({ qty: 1, product_price: 0, adjusted_product_price: 0 }, 0, "free"), true, "무료나눔 0원 통과");
assert.equal(ok({ qty: 2, product_price: 0, adjusted_product_price: 0 }, 0, "free"), true, "무료나눔 2개 0원 통과");
assert.equal(ok({ qty: 2, product_price: 7000, adjusted_product_price: 14000 }, 0, "direct"), true, "직접입력 ≥1 통과");
assert.equal(ok({ qty: 2, product_price: 0, adjusted_product_price: 0 }, 0, "direct"), false, "직접입력 0원 차단");

// ── (A) 배송비 0원 설정 경로: 줄 합계는 그대로여야 한다 ──
assert.equal(submitRowLineTotal({ qty: 2, product_price: 130000, adjusted_product_price: 260000 }), 260000, "배송비0 경로: 2개 줄 260,000 그대로(520,000 아님)");

console.log("✅ submit-row-price 통과");
