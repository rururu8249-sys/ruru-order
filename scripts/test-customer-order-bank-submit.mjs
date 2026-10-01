// 주문 API 계좌 라우팅 회귀 테스트
// 실행: node --import ./scripts/_ts-resolve.mjs scripts/test-customer-order-bank-submit.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseOrderBankRoutingResult,
  sanitizeOrderRowsForBankRouting,
} from "../lib/orderBankAccount.ts";

const valid = parseOrderBankRoutingResult({
  customer_order_segment: "first_order",
  bank_account: {
    id: "secondary",
    bankName: "신한은행",
    bankAccount: "444-555-666666",
    bankHolder: "김루루",
  },
});
assert.deepEqual(valid, {
  customerOrderSegment: "first_order",
  bankAccount: {
    id: "secondary",
    bankName: "신한은행",
    bankAccount: "444-555-666666",
    bankHolder: "김루루",
  },
});

for (const value of [
  null,
  {},
  { customer_order_segment: "guest", bank_account: valid.bankAccount },
  { customer_order_segment: "existing", bank_account: { ...valid.bankAccount, id: "third" } },
  { customer_order_segment: "existing", bank_account: { ...valid.bankAccount, bankAccount: "12ab34" } },
  { customer_order_segment: "existing", bank_account: { ...valid.bankAccount, bankHolder: "" } },
]) {
  assert.throws(() => parseOrderBankRoutingResult(value), /입금계좌/);
}

const sanitized = sanitizeOrderRowsForBankRouting([{
  order_group_id: "G-1",
  product_name: "상품",
  customer_order_segment: "existing",
  payment_bank_account_id: "primary",
  payment_bank_name: "위조은행",
  payment_bank_account: "123456",
  payment_bank_holder: "위조",
  payment_bank_assigned_at: "2026-10-01T00:00:00Z",
  bank_account: { id: "primary" },
}]);
assert.deepEqual(sanitized, [{ order_group_id: "G-1", product_name: "상품" }]);

const route = await readFile(new URL("../app/api/customer-orders/submit/route.ts", import.meta.url), "utf8");
assert.match(route, /rpc\("submit_customer_order_with_bank_routing"/);
assert.doesNotMatch(route, /rpc\("submit_customer_order_with_points"/);
assert.match(route, /p_kakao_id:\s*kakaoId/);
assert.match(route, /sanitizeOrderRowsForBankRouting/);
assert.match(route, /parseOrderBankRoutingResult/);
assert.doesNotMatch(route, /\.update\(\{\s*kakao_id:/, "카카오 ID 사후 보강 쓰기를 남기면 안 된다");

console.log("customer order bank submit tests passed");
