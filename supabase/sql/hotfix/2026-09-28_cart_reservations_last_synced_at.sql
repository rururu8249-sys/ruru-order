-- [2026-09-28] 장바구니 선점 — 손님 화면 마지막 동기화 시각(하트비트) 컬럼 추가.
--   created_at = 처음 담은 시각(절대 만료 기준), last_synced_at = 마지막 sync(관리자 「마지막 접속」 표시용).
--   ADD COLUMN only. 기존 행·재고·선점 로직 무접촉.
alter table public.cart_reservations add column if not exists last_synced_at timestamptz;
comment on column public.cart_reservations.last_synced_at is '손님 화면 마지막 동기화 시각(하트비트). created_at=처음 담은 시각(절대 만료 기준). 2026-09-28';
