-- ============================================================================
-- ㉞ 2026-10-18 점검(읽기 전용) — 아무것도 바꾸지 않음
-- ============================================================================

-- A) 전체 상품: "없음"/"" 정규화 후 같은 (색상, 사이즈) 가 2줄 이상인 stock_variants
with sv as (
  select p.id, p.product_name, p.status,
         t.ord,
         t.e->>'color' as color_raw,
         t.e->>'size'  as size_raw,
         t.e->>'stock' as stock,
         case when trim(coalesce(t.e->>'color','')) in ('없음','선택안함','-','none','NONE','None') then '' else trim(coalesce(t.e->>'color','')) end as nc,
         case when trim(coalesce(t.e->>'size','')) in ('없음','선택안함','-','none','NONE','None') then '' else trim(coalesce(t.e->>'size','')) end as ns
  from public.products p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(public.ruru_try_parse_jsonb(p.product_note)->'stock_variants') = 'array'
         then public.ruru_try_parse_jsonb(p.product_note)->'stock_variants' else '[]'::jsonb end
  ) with ordinality as t(e, ord)
)
select id, product_name, status, nc as color_norm, ns as size_norm,
       count(*) as rows_cnt,
       jsonb_agg(jsonb_build_object('idx', ord - 1, 'color', color_raw, 'size', size_raw, 'stock', stock) order by ord) as rows
from sv
group by id, product_name, status, nc, ns
having count(*) > 1
order by id;

-- B) 지금 DB 에 실제로 올라가 있는 주문 제출 RPC 가 어느 버전인지
--    (note 배열을 앞에서부터 도는 v2 = v_variant_idx / PIV 표를 찾는 버전 = product_inventory_variants)
select p.oid::regprocedure as fn,
       position('v_variant_idx' in p.prosrc) > 0              as v2_note_loop_first_match,
       position('product_inventory_variants' in p.prosrc) > 0 as uses_piv_lookup,
       position('재고가 부족합니다' in p.prosrc) > 0             as has_stock_reject
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_customer_order_with_points';

-- C) products → PIV 동기화 트리거가 켜져 있는지
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.products'::regclass and not tgisinternal;
