// [2026-09-26 긴급] order-lines select 컬럼이 orders 에 «실재»하는 것만인지 검사.
//   card_extra_amount 오타 하나로 select 전체가 에러나 목록 금액·처리창 상품·카드판정이 사라진 사고 재발 방지.
import {
  ORDER_LINES_SELECT_COLUMNS,
  ORDER_LINES_COMBINE_COLUMNS,
  orderLinesSelect,
  orderLinesCombineSelect,
} from "../lib/orderLinesColumns.ts";

let pass = 0;
function ok(c, m) { if (!c) throw new Error(m); pass++; }
function no(c, m) { if (c) throw new Error(m); pass++; }

// orders 에 실재하는 컬럼(사장님 SQL 결과 + 기존 정상 쿼리로 검증된 것). 이 목록에 없는 걸 select 하면 사고.
const KNOWN_ORDERS_COLUMNS = new Set([
  // SQL 결과(실존 확인)
  "created_at", "shipping_fee", "total_price", "payment_method", "vat_amount", "customer_phone",
  "kakao_id", "address", "broadcast_id", "adjusted_total_price", "combine_shipping_memo", "final_amount",
  // 기존 order-lines 원본 쿼리(정상 동작)로 검증된 기본 컬럼
  "id", "order_lookup_code", "product_id", "product_name", "color", "size", "qty",
  "product_price", "adjusted_product_price", "point_used_amount", "is_deleted", "adjusted_shipping_fee",
  // submit priorShippingQuery(정상 동작)로 검증
  "detail_address", "zipcode", "order_manage_status",
]);

// 사고를 낸 «없는» 컬럼들 — 절대 select 목록에 있으면 안 된다.
const FORBIDDEN = ["card_extra_amount", "shipping_address"];

for (const col of ORDER_LINES_SELECT_COLUMNS) {
  ok(KNOWN_ORDERS_COLUMNS.has(col), `본 조회 컬럼 '${col}' 가 orders 실존 목록에 없음 — select 에서 빼야 함`);
}
for (const col of ORDER_LINES_COMBINE_COLUMNS) {
  ok(KNOWN_ORDERS_COLUMNS.has(col), `합배송 조회 컬럼 '${col}' 가 orders 실존 목록에 없음`);
}
for (const bad of FORBIDDEN) {
  no(ORDER_LINES_SELECT_COLUMNS.includes(bad), `금지 컬럼 '${bad}' 가 본 조회에 있음`);
  no(ORDER_LINES_COMBINE_COLUMNS.includes(bad), `금지 컬럼 '${bad}' 가 합배송 조회에 있음`);
}

// 카드 판정·금액에 꼭 필요한 컬럼은 반드시 포함(없어지면 카드/금액 회귀).
for (const need of ["payment_method", "vat_amount", "adjusted_total_price", "product_id", "adjusted_product_price", "shipping_fee"]) {
  ok(ORDER_LINES_SELECT_COLUMNS.includes(need), `필수 컬럼 '${need}' 누락`);
}

// select() 문자열도 같은 규칙(문자열로 조립돼도 없는 컬럼이 안 섞이게).
const sel = orderLinesSelect();
no(/card_extra_amount|shipping_address/.test(sel), "select 문자열에 금지 컬럼 포함");
ok(sel.includes("payment_method") && sel.includes("vat_amount"), "select 문자열에 카드 컬럼 포함");
ok(orderLinesCombineSelect().includes("address"), "합배송 select 에 address 포함");

console.log(`✅ order-lines-columns ${pass}건 통과`);
