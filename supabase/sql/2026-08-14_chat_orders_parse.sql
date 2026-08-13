-- [2026-08-14] 채팅 주문봇 3단계: 파싱 결과 저장 컬럼
-- ADD COLUMN only. 기존 컬럼/데이터 무변경. 돈·재고·주문 테이블 무접촉.
alter table chat_orders add column if not exists parsed_product_id   text;
alter table chat_orders add column if not exists parsed_product_name text;
alter table chat_orders add column if not exists parsed_variant      text;
alter table chat_orders add column if not exists parsed_qty          integer;
alter table chat_orders add column if not exists parsed_matched_by   text;
alter table chat_orders add column if not exists parsed_options      text;
alter table chat_orders add column if not exists parsed_candidates   text;
alter table chat_orders add column if not exists parsed_reason       text;
alter table chat_orders add column if not exists parsed_at           timestamptz;

-- parse_status 값: raw(미파싱) / parsed / need_product / ambiguous / not_order
create index if not exists idx_chat_orders_parse_status on chat_orders (parse_status);
