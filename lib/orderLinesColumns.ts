// [2026-09-26 긴급] order-lines 라우트가 orders 에서 읽는 컬럼 목록 — 한 곳으로 모아 테스트로 지킨다.
//   ⚠️ Supabase 는 «없는 컬럼» 하나만 섞여도 select 전체가 에러난다. card_extra_amount 오타 하나로
//     목록 금액·처리창 상품·카드판정이 전부 사라진 사고(2026-09-26) 재발 방지.
//   ⚠️ 읽기 전용. 여기 컬럼은 전부 orders 에 «실재»해야 한다(test-order-lines-columns 가 검사).

// 본 조회: 상품 줄·금액·결제방법·카드총액·주소/손님(합배송 판정용).
//   카드추가금은 vat_amount 로만 읽는다(card_extra_amount 는 orders 에 없음 — 주문상세도 계산·vat_amount 사용).
export const ORDER_LINES_SELECT_COLUMNS = [
  "id", "order_lookup_code", "product_id", "product_name", "color", "size", "qty",
  "product_price", "adjusted_product_price", "shipping_fee", "point_used_amount", "created_at",
  "payment_method", "vat_amount", "adjusted_total_price", "total_price", "final_amount",
  "combine_shipping_memo", "address", "detail_address", "kakao_id", "customer_phone", "broadcast_id",
  "is_deleted",
] as const;

// 합배송 교차 조회(같은 손님 다른 주문): 주소키·손님·방송·날짜만.
export const ORDER_LINES_COMBINE_COLUMNS = [
  "order_lookup_code", "address", "detail_address", "kakao_id", "customer_phone", "broadcast_id", "created_at", "is_deleted",
] as const;

export const orderLinesSelect = () => ORDER_LINES_SELECT_COLUMNS.join(", ");
export const orderLinesCombineSelect = () => ORDER_LINES_COMBINE_COLUMNS.join(", ");
