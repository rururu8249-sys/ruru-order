-- supabase/sql/orders_picked_at.sql
-- 목적: 물건챙기기 체크리스트의 "챙김" 표시를 서버에 저장(여러 기기·새로고침에도 유지).
--   orders 각 행(상품 1줄)에 picked_at(챙긴 시각). 체크 시 시각 기록, 해제 시 null.
--   돈/입금/정산/주문상태와 무관한 운영용 컬럼. ADD COLUMN only(기존 데이터 변경 없음).
-- 적용: Supabase SQL Editor에 붙여넣고 Run.

alter table public.orders add column if not exists picked_at timestamptz;
