-- supabase/sql/add_product_sale_mode.sql
-- 목적: products에 판매 모드(sale_mode) 컬럼 추가 — 방송상품 / 상시판매(shop) / 둘 다(both) 구분.
-- 주의:
-- - 이 파일을 만드는 것만으로는 적용되지 않습니다. Supabase SQL Editor에서 직접 실행해야 합니다.
-- - ADD COLUMN only (기존 데이터 보호). 기본값 'both'.

ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_mode text DEFAULT 'both' CHECK (sale_mode IN ('broadcast', 'shop', 'both'));
