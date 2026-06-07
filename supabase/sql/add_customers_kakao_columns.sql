-- supabase/sql/add_customers_kakao_columns.sql
-- 목적: customers에 카카오 식별자 + 로그인 시각 컬럼 추가.
--   - kakao_id / kakao_nickname: 카카오 로그인 식별(현재는 전화번호 기준 매칭만 → ID 기반 연결 가능하게)
--   - first_login_at / last_login_at: 최초/최근 로그인 시각
-- 주의:
--   - 이 파일만으로는 적용되지 않습니다. Supabase SQL Editor에서 직접 실행해야 합니다.
--   - ADD COLUMN IF NOT EXISTS (기존 데이터 보호). 전부 nullable.
--   - 적용 후 app/api/customer-login-sync/route.ts 에서 이 컬럼 저장 로직을 추가해야 실제로 채워집니다.

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS kakao_id text,
ADD COLUMN IF NOT EXISTS kakao_nickname text,
ADD COLUMN IF NOT EXISTS first_login_at timestamptz,
ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
