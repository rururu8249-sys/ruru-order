-- 2026-10-27 꼼데 가디건 — 유령 줄 「차콜 핑크셔츠」 재고를 「차콜 핑크하트」로 합치고 이름 바꿈 기록 남기기
--   option_rename_guard_20261027.sql 을 먼저 Run 한 뒤 실행. 한 트랜잭션 — 재고 총합이 달라지면 예외 → 아무것도 안 바뀜.
--   셔츠 재고는 10/26 밤 셔츠→핑크하트 주문 수정 때 핑크하트에서 빠져 셔츠 줄로 간 것(같은 물건) → 핑크하트로 되돌림.
--   이름 바꿈 기록(option_renames)을 남겨서, 남은 셔츠 주문을 고치거나 취소해도 핑크하트 줄로 정상 처리됨.

-- [전] 지금 상태
select v->>'color' as 색상, v->>'size' as 사이즈, v->>'stock' as 재고
from public.products p, jsonb_array_elements(p.product_note::jsonb->'stock_variants') v
where p.product_name = '꼼데 가디건' and v->>'color' like '차콜 핑크%'
order by 1, 2;

begin;
do $do$
declare
  v_id bigint;
  v_note jsonb;
  v_before int;
  v_after int;
  v_new jsonb;
  v_ren jsonb;
begin
  select id, product_note::jsonb into v_id, v_note from public.products where product_name = '꼼데 가디건' for update;
  if v_id is null then raise exception '꼼데 가디건 상품을 못 찾음 — 아무것도 안 바꿈'; end if;
  if (select count(*) from public.products where product_name = '꼼데 가디건') <> 1 then raise exception '같은 이름 상품이 여러 개 — 아무것도 안 바꿈'; end if;
  if not exists (select 1 from jsonb_array_elements(v_note->'stock_variants') v where v->>'color' = '차콜 핑크셔츠') then
    raise notice '셔츠 줄 없음 — 할 일 없음'; return;
  end if;
  select coalesce(sum(case when (v->>'stock') ~ '^[0-9]+$' then (v->>'stock')::int else 0 end), 0) into v_before
    from jsonb_array_elements(v_note->'stock_variants') v;

  -- 핑크하트 줄에 같은 사이즈 셔츠 재고 더하기 / 같은 사이즈 핑크하트 줄이 없으면 셔츠 줄 이름만 핑크하트로
  select coalesce(jsonb_agg(x.e order by x.ord), '[]'::jsonb) into v_new from (
    select t.ord,
      case
        when t.e->>'color' = '차콜 핑크하트' then t.e || jsonb_build_object('stock',
          (case when (t.e->>'stock') ~ '^[0-9]+$' then (t.e->>'stock')::int else 0 end)
          + coalesce((select sum(case when (g->>'stock') ~ '^[0-9]+$' then (g->>'stock')::int else 0 end)
                        from jsonb_array_elements(v_note->'stock_variants') g
                       where g->>'color' = '차콜 핑크셔츠' and coalesce(g->>'size','') = coalesce(t.e->>'size','')), 0))
        when t.e->>'color' = '차콜 핑크셔츠' then t.e || jsonb_build_object('color', '차콜 핑크하트')
        else t.e
      end as e
    from jsonb_array_elements(v_note->'stock_variants') with ordinality as t(e, ord)
    where t.e->>'color' <> '차콜 핑크셔츠'
       or not exists (select 1 from jsonb_array_elements(v_note->'stock_variants') h
                      where h->>'color' = '차콜 핑크하트' and coalesce(h->>'size','') = coalesce(t.e->>'size',''))
  ) x;
  select coalesce(sum(case when (v->>'stock') ~ '^[0-9]+$' then (v->>'stock')::int else 0 end), 0) into v_after
    from jsonb_array_elements(v_new) v;
  if v_before <> v_after then raise exception '재고 총합이 달라짐(% → %) — 아무것도 안 바꿈', v_before, v_after; end if;
  if exists (select 1 from jsonb_array_elements(v_new) v where v->>'color' = '차콜 핑크셔츠') then
    raise exception '셔츠 줄이 남음 — 아무것도 안 바꿈';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('from_color', '차콜 핑크셔츠', 'from_size', s, 'to_color', '차콜 핑크하트', 'to_size', s, 'at', now())), '[]'::jsonb)
    into v_ren
    from (select distinct coalesce(v->>'size', '') s from jsonb_array_elements(v_new) v where v->>'color' = '차콜 핑크하트') z;

  update public.products
     set product_note = (v_note
       || jsonb_build_object('stock_variants', v_new)
       || jsonb_build_object('option_renames', coalesce(case when jsonb_typeof(v_note->'option_renames') = 'array' then v_note->'option_renames' end, '[]'::jsonb) || v_ren))::text
   where id = v_id;
  raise notice '합침 완료 — 총 재고 % 그대로', v_after;
end;
$do$;
commit;

-- [후] 결과 (셔츠 줄 없음, 핑크하트 = 원래 핑크하트 + 셔츠)
select v->>'color' as 색상, v->>'size' as 사이즈, v->>'stock' as 재고
from public.products p, jsonb_array_elements(p.product_note::jsonb->'stock_variants') v
where p.product_name = '꼼데 가디건' and v->>'color' like '차콜 핑크%'
order by 1, 2;
select v.color, v.size, v.stock from public.product_inventory_variants v
join public.products p on p.id = v.product_id
where p.product_name = '꼼데 가디건' and v.color like '차콜 핑크%' order by 1, 2;
