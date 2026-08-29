-- [2026-08-29] 같은 디자인 묶기 — 전부 초기화(되돌리기)
--
-- 왜
--   사장님 지시: "묶음 기준이 확실하지 않아 손님 화면이 헷갈린다. 없었던 일로 하자."
--   화면(고객 주문서 / 관리자)에서는 이미 코드로 제거했다.
--   여기서는 DB에 남아 있는 product_note.design_groups 값만 지운다.
--
-- 안전
--   · products.product_note 안의 'design_groups' 키 하나만 제거한다.
--   · price / color_options / brand_group / option_pricing / size_charts / 재고 / 주문 / 입금 무관.
--   · ADD/REMOVE COLUMN 없음. 다른 테이블 손대지 않음.
--
-- 실행 순서: [1] 미리보기 → [2] 실제 삭제 → [3] 검증

-- ─────────────────────────────────────────────────────────────
-- [1] 미리보기 (읽기 전용) — 지금 묶음이 들어 있는 상품
-- ─────────────────────────────────────────────────────────────
select
  p.id,
  p.product_name,
  p.price,
  jsonb_array_length((p.product_note::jsonb) -> 'design_groups') as 묶음수
from public.products p
where p.product_note is not null
  and p.product_note <> ''
  and jsonb_typeof((p.product_note::jsonb) -> 'design_groups') = 'array'
order by p.id;

-- ─────────────────────────────────────────────────────────────
-- [2] 실제 삭제 — design_groups 키만 제거
-- ─────────────────────────────────────────────────────────────
update public.products p
set product_note = ((p.product_note::jsonb) - 'design_groups')::text
where p.product_note is not null
  and p.product_note <> ''
  and (p.product_note::jsonb) ? 'design_groups';

-- ─────────────────────────────────────────────────────────────
-- [3] 검증 — 아래 두 쿼리 모두 0 이어야 정상
-- ─────────────────────────────────────────────────────────────
select count(*) as 남은_묶음상품수
from public.products p
where p.product_note is not null
  and p.product_note <> ''
  and (p.product_note::jsonb) ? 'design_groups';

-- 가격이 하나도 안 바뀌었는지 확인 (버버리 129000 / 몽클레어 139000 유지)
select id, product_name, price
from public.products
where id in (673, 682)
order by id;

-- size_charts / color_options 가 그대로 살아있는지 확인
select
  p.id,
  p.product_name,
  (select count(*) from jsonb_object_keys((p.product_note::jsonb) -> 'size_charts')) as 실측표수,
  jsonb_array_length(p.color_options) as 색상옵션수
from public.products p
where p.id in (673, 682)
order by p.id;
