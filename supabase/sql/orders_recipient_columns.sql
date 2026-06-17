-- orders_recipient_columns.sql
-- 목적(받는사람 분리): 주문에 "받는사람(배송)" 이름/연락처를 주문자와 별도로 저장.
--   - 주문자(customer_name/customer_phone)는 입금확인·정산·포인트 매칭 기준 → 그대로 유지.
--   - recipient_name/recipient_phone 은 배송/송장 전용. 비어있으면 송장은 기존대로 닉네임/주문자명 사용.
-- 안전: ADD COLUMN only (기존 데이터/로직 무영향). 주문제출 RPC 무변경(제출 직후 서버에서 별도 저장).

alter table orders add column if not exists recipient_name text;
alter table orders add column if not exists recipient_phone text;
