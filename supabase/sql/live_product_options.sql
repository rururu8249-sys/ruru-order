-- supabase/sql/live_product_options.sql
-- 목적:
-- products 테이블을 방송상품/공구상품 선택형 주문서에 맞게 확장합니다.
--
-- 안전 원칙:
-- - orders / deposits / 정산 관련 테이블 수정 없음
-- - 기존 주문금액/배송비/입금확인/정산 로직 변경 없음
-- - ADD COLUMN IF NOT EXISTS만 사용
-- - 기존 products 데이터 삭제/변경 없음

alter table public.products
  add column if not exists color_options jsonb default '[]'::jsonb,
  add column if not exists size_options jsonb default '[]'::jsonb,
  add column if not exists size_option_enabled boolean default true,
  add column if not exists is_pinned boolean default false,
  add column if not exists image_url text,
  add column if not exists image_path text,
  add column if not exists delivery_group_key text,
  add column if not exists product_note text;

comment on column public.products.color_options is
'선택형 주문서 색상 옵션. 예: ["블랙","화이트"]';

comment on column public.products.size_options is
'선택형 주문서 사이즈 옵션. 예: ["S","M","L"] 또는 ["240","245"]';

comment on column public.products.size_option_enabled is
'false이면 고객 주문서에서 사이즈 선택 없이 주문 가능';

comment on column public.products.is_pinned is
'true이면 고객 상품리스트 상단 고정';

comment on column public.products.image_url is
'상품 이미지 공개 URL. 사진 업로드 2차 단계에서 사용';

comment on column public.products.image_path is
'Storage 내부 이미지 경로. 사진 완전삭제 시 사용';

comment on column public.products.delivery_group_key is
'업체배송 배송비 1회 부과 판단용 그룹키. 예: vendor_a, vendor_lamer';

comment on column public.products.product_note is
'관리자용 상품 메모 또는 고객 노출용 짧은 상품 안내';
