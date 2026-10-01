import assert from "node:assert/strict";

import {
  PURCHASE_LIMIT_PRODUCT_COLUMNS,
  buildDepositOrderLookupPlan,
  purchaseLimitProductSelect,
} from "../lib/orderSchemaQueries.ts";

const PRODUCT_COLUMNS = new Set(["id", "product_name", "product_note"]);
const ORDER_COLUMNS = new Set(["id", "order_group_id", "order_lookup_code"]);

assert.deepEqual(
  PURCHASE_LIMIT_PRODUCT_COLUMNS.filter((column) => !PRODUCT_COLUMNS.has(column)),
  [],
  "구매제한 상품 조회는 운영 products 테이블에 존재하는 컬럼만 사용해야 한다",
);
assert.equal(
  purchaseLimitProductSelect(),
  "id, product_name, product_note",
  "구매제한 조회 문자열은 검증된 컬럼 목록에서 만들어져야 한다",
);

const lookupPlan = buildDepositOrderLookupPlan(
  ["RURU-GROUP-1"],
  ["101", "not-a-number"],
);
assert.deepEqual(
  lookupPlan.map((query) => query.column),
  ["order_group_id", "order_lookup_code", "id"],
  "입금 연결 주문 조회는 운영 orders 테이블의 실제 키만 조회해야 한다",
);
assert.deepEqual(
  lookupPlan.filter((query) => !ORDER_COLUMNS.has(query.column)),
  [],
  "입금 연결 주문 조회 계획에 존재하지 않는 호환 컬럼이 들어가면 안 된다",
);
assert.deepEqual(lookupPlan.at(-1)?.values, [101]);

console.log("order schema query contract tests passed");
