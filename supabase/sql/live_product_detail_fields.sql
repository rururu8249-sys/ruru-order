-- supabase/sql/live_product_detail_fields.sql
-- 목적:
-- products 테이블에 상품상세설명/상세사진 URL 저장 컬럼을 추가합니다.
--
-- 안전 원칙:
-- - products 테이블 컬럼 추가만 수행
-- - 기존 주문/입금/정산/배송비 관련 테이블 수정 없음
-- - 기존 데이터 삭제/변경 없음
-- - ADD COLUMN IF NOT EXISTS만 사용

alter table public.products
  add column if not exists product_description text,
  add column if not exists detail_image_urls jsonb default '[]'::jsonb;

comment on column public.products.product_description is
'상품 상세설명. 고객 상품상세 화면에 표시할 긴 설명';

comment on column public.products.detail_image_urls is
'상품 상세사진 URL 목록. 예: ["https://.../detail1.webp","https://.../detail2.webp"]';
