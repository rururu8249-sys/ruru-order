// [a2-3 2026-10-21] 정산 「상품 원가(자동)」 — 기존 숫자(netAmount 등) 불변 + 원가 줄 계산 검증
import assert from "node:assert/strict";
import { calculateStats, orderProductCost } from "../components/admin-live/settlement/settlementUtils.ts";

const paid = (extra) => ({ payment_status: "입금확인", final_amount: 50000, ...extra });
// LiveOrder 모양(items[])
const rows = [
  paid({ id: "a", items: [{ qty: 2, costPriceSnapshot: 12000 }, { qty: 1, costPriceSnapshot: null }] }),
  paid({ id: "b", items: [{ qty: 3, costPriceSnapshot: 7000 }] }),
  paid({ id: "c", items: [{ qty: 1 }] }),
  { id: "d", payment_status: "입금대기", final_amount: 99000, items: [{ qty: 1, costPriceSnapshot: 1000 }] }, // 미결제 → 제외
  { id: "e", payment_status: "입금확인", order_manage_status: "주문취소", final_amount: 10000, items: [{ qty: 1, costPriceSnapshot: 1000 }] }, // 취소 → 제외
];
const stats = calculateStats(rows, 7, []);
assert.equal(stats.paidCount, 3);
assert.equal(stats.paidAmount, 150000);
assert.equal(stats.netAmount, 150000, "기존 순이익 식 불변(원가 안 섞임)");
assert.equal(stats.productCostAmount, 2 * 12000 + 3 * 7000);
assert.equal(stats.productCostRowCount, 2);
assert.equal(stats.productCostMissingCount, 2);
assert.equal(stats.netAfterProductCost, 150000 - 45000);
// flat 주문 줄 모양(cost_price_snapshot·qty)
assert.deepEqual(orderProductCost({ cost_price_snapshot: 5000, qty: 4 }), { amount: 20000, withCost: 1, missing: 0 });
assert.deepEqual(orderProductCost({ cost_price_snapshot: "0", qty: 4 }), { amount: 0, withCost: 0, missing: 1 });
assert.deepEqual(orderProductCost({ qty: 4 }), { amount: 0, withCost: 0, missing: 1 });
// 원가 없는 데이터면 기존과 같은 결과 + 원가 0/건수만
const plain = calculateStats([paid({ id: "x" })], 7, []);
assert.equal(plain.productCostAmount, 0);
assert.equal(plain.productCostRowCount, 0);
assert.equal(plain.productCostMissingCount, 1);
assert.equal(plain.netAfterProductCost, plain.netAmount);
console.log("PASS settlement product cost: netAmount unchanged, Σqty×snapshot, missing counts, flat rows");
