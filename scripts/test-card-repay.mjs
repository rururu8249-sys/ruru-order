// node --import ./scripts/_ts-resolve.mjs scripts/test-card-repay.mjs
import assert from "node:assert/strict";
import { cardRepayRowFrom, planCardRepay } from "../lib/cardRepay.ts";

// 또요 사례: 72,000(+5,040) / 156,000(+10,920), 무료배송 → 처음 243,960, 새 77,040
const rows = [
  cardRepayRowFrom({ id: 1, final_amount: 77040, vat_amount: 5040, shipping_fee: 0 }),
  cardRepayRowFrom({ id: 2, final_amount: 166920, vat_amount: 10920, shipping_fee: 0 }),
];
let p = planCardRepay(rows, new Set(["2"]));
assert.equal(p.originalTotal, 243960);
assert.equal(p.removeTotal, 166920);
assert.equal(p.newTotal, 77040);
assert.equal(p.newVat, 5040);
assert.equal(p.blockReason, "");

// 줄 금액 읽는 순서: final → adjusted_total → total
assert.equal(cardRepayRowFrom({ id: 3, final_amount: null, adjusted_total_price: 900, total_price: 1000 }).total, 900);
assert.equal(cardRepayRowFrom({ id: 3, total_price: 1000 }).total, 1000);
// 배송비: adjusted 우선
assert.equal(cardRepayRowFrom({ id: 3, adjusted_shipping_fee: 0, shipping_fee: 4000 }).shipping, 0);

// 빼는 줄에 배송비가 있으면 남는 줄로 옮겨진다 → 새 금액에 다시 더함
const withShip = [
  cardRepayRowFrom({ id: 1, final_amount: 43000, shipping_fee: 4000 }),
  cardRepayRowFrom({ id: 2, final_amount: 20000, shipping_fee: 0 }),
];
p = planCardRepay(withShip, new Set(["1"]));
assert.equal(p.movedShipping, 4000);
assert.equal(p.newTotal, 24000);
assert.equal(p.removeTotal, 39000);

// 막는 경우
assert.equal(planCardRepay(rows, new Set()).blockReason, "뺄 상품을 골라 주세요");
assert.equal(planCardRepay(rows, new Set(["1", "2"])).blockReason, "전부 빼려면 주문 전체 취소를 쓰세요");
assert.equal(planCardRepay([], new Set(["1"])).blockReason, "주문 상품을 불러오는 중이에요");

console.log("test-card-repay OK");
