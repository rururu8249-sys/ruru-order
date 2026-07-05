-- ============================================================================
-- 반품/교환 최소형(기록 전용) 컬럼 추가 — 2026-07-05
-- ============================================================================
-- ▶ 목적: 주문상세에서 반품/교환 상태·사유·환불금액을 "기록"으로만 관리.
-- ▶ 이 컬럼들은 정산/입금/재고/포인트/주문상태 어떤 계산에도 사용되지 않음(표시 전용).
-- ▶ 규칙: ADD COLUMN only (기존 데이터 무변경 · IF NOT EXISTS로 재실행 안전)
-- ▶ 적용: Supabase SQL Editor에서 실행해야 저장 동작함
--   (미실행 시: 주문상세 반품/교환 저장이 에러 토스트만 뜨고 다른 기능은 영향 없음)
-- ============================================================================

alter table public.orders add column if not exists return_status text;
alter table public.orders add column if not exists return_reason text;
alter table public.orders add column if not exists return_amount integer;
alter table public.orders add column if not exists return_updated_at timestamptz;
