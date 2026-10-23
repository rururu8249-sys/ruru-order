-- supabase/sql/orders_pick_pulled_target.sql
-- [2026-10-23 사장님] «출고 넘기기» — 넘길 곳(방송)을 고를 수 있게 칸 2개 추가.
--   예전엔 «버튼 누른 날짜»로만 적혀서, 주문서를 방송으로 보면 넘긴 주문이 안 보였다.
--   돈/입금/정산/주문상태/포인트와 무관한 운영 칸. ADD COLUMN only(기존 데이터 변경 없음).
-- 적용: Supabase SQL Editor 에 붙여넣고 Run (한 번만).

alter table public.orders add column if not exists pick_pulled_broadcast_id text;
alter table public.orders add column if not exists pick_pulled_target text;

comment on column public.orders.pick_pulled_broadcast_id is '출고 넘기기 — 넘긴 방송 id(쇼핑몰 날짜로 넘겼으면 비어 있음)';
comment on column public.orders.pick_pulled_target is '출고 넘기기 — 넘긴 곳 이름(예: 10.22(목) 남녀공용의류 / 10.23(금) 쇼핑몰 주문)';

create index if not exists orders_pick_pulled_broadcast_idx on public.orders (pick_pulled_broadcast_id) where pick_pulled_broadcast_id is not null;
