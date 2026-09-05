-- supabase/sql/customers_kakao_raw_20260905.sql
-- [2026-09-05 사장님 요청 · 카카오 원본 보존] 카카오 로그인 때 카카오가 내려준 "원본" 이름/번호를 따로 보관.
--   손님이 우리 화면에서 이름/번호를 이상하게 바꿔도 관리자 회원상세에서 진짜를 확인할 수 있게.
--   ADD COLUMN only (기존 데이터 무변경). 주문/입금/정산/포인트 무관.
--   적용: Supabase SQL Editor 에 붙여넣고 Run. (실행 전에도 로그인·화면은 정상 — 코드가 칸 없음을 조용히 넘김)
alter table public.customers add column if not exists kakao_account_name   text;
alter table public.customers add column if not exists kakao_account_phone  text;
alter table public.customers add column if not exists kakao_shipping_name  text;
alter table public.customers add column if not exists kakao_shipping_phone text;
alter table public.customers add column if not exists kakao_raw_synced_at  timestamptz;
comment on column public.customers.kakao_account_name  is '카카오 계정 이름(원본, 로그인 때 갱신)';
comment on column public.customers.kakao_account_phone is '카카오 계정 전화번호(원본, 숫자만)';
comment on column public.customers.kakao_shipping_name is '카카오 배송지 받는분 이름(원본)';
comment on column public.customers.kakao_shipping_phone is '카카오 배송지 받는분 번호(원본, 숫자만)';
comment on column public.customers.kakao_raw_synced_at is '카카오 원본 마지막 갱신 시각';
