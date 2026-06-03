-- supabase/sql/orders_order_group_id_index.sql
-- 목적:
-- - 고객 주문 제출 멱등성(중복 제출 방지) 가드가 order_group_id로 기존 주문을 빠르게 조회하도록
--   조회용 인덱스를 추가한다.
--
-- 주의:
-- - 이 파일을 만들고 커밋하는 것만으로는 DB에 적용되지 않습니다.
--   실제 적용은 Supabase SQL Editor에서 별도 실행해야 합니다.
-- - UNIQUE 인덱스가 아닙니다. 한 주문(여러 상품)의 모든 행이 동일한 order_group_id를
--   공유하므로 UNIQUE를 걸면 2개 이상 상품 주문이 거부되어 정상 주문이 깨집니다.
--   따라서 일반(btree) 인덱스만 추가하고, 중복 차단은
--   submit_customer_order_with_points RPC 내부의 advisory lock + 존재여부 가드로 처리합니다.
-- - 기존 데이터/주문 흐름 변경 없음(조회 성능만 개선).

create index if not exists orders_order_group_id_idx
  on public.orders (order_group_id);
