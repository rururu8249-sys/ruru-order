-- supabase/sql/orders_pick_pulled.sql
-- [2026-10-22 사장님] 「지난 주문 가져오기」 — 지난 방송 주문 «줄»을 오늘 주문서·송장·물건챙기기에 넣는다.
--   주문을 복사하거나 날짜를 바꾸지 않는다. 줄에 «가져온 날짜·사유»만 적는다.
--   돈/입금/정산/주문상태/포인트와 무관한 운영 칸. ADD COLUMN only(기존 데이터 변경 없음).
-- 적용: Supabase SQL Editor 에 붙여넣고 Run (한 번만).

alter table public.orders add column if not exists pick_pulled_at timestamptz;
alter table public.orders add column if not exists pick_pulled_for date;
alter table public.orders add column if not exists pick_pulled_reason text;
alter table public.orders add column if not exists pick_pulled_prev jsonb;

comment on column public.orders.pick_pulled_at is '지난 주문 가져오기 — 가져온 시각(없으면 안 가져온 줄)';
comment on column public.orders.pick_pulled_for is '지난 주문 가져오기 — 가져온 날짜(KST). 이 날짜 주문서·송장·물건챙기기에 나타남';
comment on column public.orders.pick_pulled_reason is '지난 주문 가져오기 — 사유(고객이슈 교환 / 직접 선택 · 메모)';
comment on column public.orders.pick_pulled_prev is '지난 주문 가져오기 — 가져오기 전 picked_at/collected_at/invoice_printed_at 보관(빼기 때 원복)';

-- 오늘 주문서가 «가져온 줄»을 빨리 찾도록(가져온 줄만 인덱스 — 거의 비어 있어 가볍다)
create index if not exists orders_pick_pulled_for_idx on public.orders (pick_pulled_for) where pick_pulled_for is not null;

-- 확인
-- select column_name, data_type from information_schema.columns
--  where table_name = 'orders' and column_name like 'pick_pulled%';
