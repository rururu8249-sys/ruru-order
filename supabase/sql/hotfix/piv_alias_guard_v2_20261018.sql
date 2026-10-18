-- ============================================================================
-- ㉟ 2026-10-18 재고 유령줄 근본 재발방지 — PIV "없음↔빈값" 가드 v2 + 1회 정리 + 자가 시뮬레이션
--   Supabase SQL Editor 에서 실행. [0]은 읽기만, [1]~[5]는 하나의 트랜잭션(중간 실패 시 전부 롤백),
--   [6] 자가 시뮬레이션은 별도 트랜잭션이고 항상 rollback(아무것도 안 남김).
--   되돌리기: supabase/sql/hotfix/piv_alias_guard_v2_rollback_20261018.sql
--
-- ─────────────────────────────────────────────────────────────────────────
-- 무엇이 문제였나
-- ─────────────────────────────────────────────────────────────────────────
--   08-13 가드(ruru_piv_none_alias_guard)는 색상·사이즈 «둘 다» ''/'없음' 일 때만 동작했다.
--   → 색상만 '없음' + 사이즈 실값(699 나이키 바람막이 M) 같은 경우는 그냥 통과.
--   → 관리자 「재고연동 상품수정」·취소복구·주문상품 추가/삭제 RPC 가 '없음'→'' 로 바꾼 뒤
--     `insert … values (…, '', 'M', 0) on conflict do nothing` → 이름이 다르니 충돌이 아니라 «새 행» 생성.
--   → 그 0개 행이 note 로 역동기화(ruru_sync_product_stock_note_from_variants) → 손님 옵션창 품절 오표시,
--     제출 RPC(note 배열 앞에서부터 첫 일치) 가 0개 줄을 먼저 잡아 「재고가 부족합니다」 거절 위험.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 무엇을 바꾸나 (재고 RPC 4개·주문 제출 RPC 본문은 한 줄도 안 건드림)
-- ─────────────────────────────────────────────────────────────────────────
--   PIV BEFORE INSERT 트리거 함수만 교체(같은 트리거 이름 그대로).
--   · 색상·사이즈 둘 다 실값 → 바로 통과(지금과 같음, 성능 영향 없음)
--   · 정확히 같은 키가 이미 있음 → 통과(호출 쪽 on conflict do nothing 그대로)
--   · 둘 다 ''/'없음' → 08-13 규칙 그대로(이름 맞추고 재고 더함) — 기존 규칙 유지
--   · [새로] 한 축만 ''/'없음' 이고 나머지 축이 «정확히» 같은 기존 행이 있으면:
--       - 들어오는 재고 0 (RPC 경로: 항상 0으로 넣고 뒤에서 UPDATE) → 기존 행을 쓴다(새 행 안 만듦).
--         기존 행 이름을 들어온 이름으로 맞춰서, 정확일치로 찾는 RPC(취소복구)도 그 행(진짜 재고)을 찾게 한다. 재고 숫자 불변.
--       - 기존 행이 0개(유령)이고 들어오는 재고 > 0 → 기존 유령 행을 들어온 이름·재고로 교체(새 행 안 만듦). 총합 = 들어온 값.
--       - 둘 다 재고 > 0 → 판단 불가(합치면 이중계산 또는 손실 위험) → 지금과 똑같이 새 행 생성(아무것도 안 바꿈).
--   ※ 재고 총합을 늘리거나 줄이는 경로가 없다(0개 행만 흡수).
-- ============================================================================


-- ── [0] 라이브 상태 확인 (읽기만) ─────────────────────────────────────────
-- 0-1) PIV 에 08-13 가드 트리거가 붙어 있는지 / 함수 원문 일부
select t.tgname, t.tgenabled, p.proname,
       position('and coalesce(trim(new.size),  '''') in' in p.prosrc) > 0 as is_v1_both_axes_only,
       position('ruru_piv_alias_guard_v2' in p.prosrc) > 0               as is_v2
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.product_inventory_variants'::regclass and not t.tgisinternal;

-- 0-2) products → PIV 재구성 트리거(note 저장 시 PIV 다시 만듦)
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.products'::regclass and not tgisinternal;

-- 0-4) 아래 정리에 쓰는 JSON 파서 함수가 있는지(없으면 [1]에서 실패 → 전체 롤백, 아무것도 안 바뀜)
select to_regprocedure('public.ruru_try_parse_jsonb(text)') is not null as has_ruru_try_parse_jsonb;

-- 0-3) 주문 제출 RPC 버전 (v2 = note 배열 첫 일치 / PIV 조회 버전)
select position('v_variant_idx' in p.prosrc) > 0              as v2_note_loop_first_match,
       position('product_inventory_variants' in p.prosrc) > 0 as uses_piv_lookup
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_customer_order_with_points';


begin;

-- ── [1] 정리 전 스냅샷 + 백업 ────────────────────────────────────────────
--   ''/'없음' 만 다른(나머지 축 정확히 같은) 중복 그룹 — note 기준
create temp table _alias_note_before on commit drop as
with sv as (
  select p.id as product_id, t.ord, t.e,
         case when btrim(coalesce(t.e->>'color','')) in ('','없음') then '' else btrim(coalesce(t.e->>'color','')) end as nc,
         case when btrim(coalesce(t.e->>'size','')) in ('','없음') then '' else btrim(coalesce(t.e->>'size','')) end as ns,
         (case when coalesce(t.e->>'stock','') ~ '^[0-9]+(\.[0-9]+)?$' then (t.e->>'stock')::numeric else 0 end) > 0 as has_stock,
         coalesce((t.e->>'manual_soldout')::boolean, false) as manual_soldout
  from public.products p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(public.ruru_try_parse_jsonb(p.product_note)->'stock_variants') = 'array'
         then public.ruru_try_parse_jsonb(p.product_note)->'stock_variants' else '[]'::jsonb end
  ) with ordinality as t(e, ord)
)
select * from sv
where (product_id, nc, ns) in (
  select product_id, nc, ns from sv group by 1,2,3 having count(*) > 1
);

create temp table _alias_piv_before on commit drop as
select v.*,
       case when btrim(coalesce(v.color,'')) in ('','없음') then '' else btrim(coalesce(v.color,'')) end as nc,
       case when btrim(coalesce(v.size,'')) in ('','없음') then '' else btrim(coalesce(v.size,'')) end as ns
from public.product_inventory_variants v
where (v.product_id,
       case when btrim(coalesce(v.color,'')) in ('','없음') then '' else btrim(coalesce(v.color,'')) end,
       case when btrim(coalesce(v.size,'')) in ('','없음') then '' else btrim(coalesce(v.size,'')) end) in (
  select product_id,
         case when btrim(coalesce(color,'')) in ('','없음') then '' else btrim(coalesce(color,'')) end,
         case when btrim(coalesce(size,'')) in ('','없음') then '' else btrim(coalesce(size,'')) end
  from public.product_inventory_variants
  group by 1,2,3 having count(*) > 1
);

-- 영구 백업(되돌리기용) — 새 테이블만 만든다(기존 테이블 무변경)
create table if not exists public.ruru_alias_cleanup_backup_20261018 (
  backup_id bigserial primary key,
  kind text not null,              -- 'note' | 'piv'
  product_id bigint not null,
  product_note text,               -- kind='note' : 정리 전 note 원문
  piv_row jsonb,                   -- kind='piv'  : 지운 PIV 행
  created_at timestamptz not null default now()
);

insert into public.ruru_alias_cleanup_backup_20261018 (kind, product_id, product_note)
select 'note', p.id, p.product_note
from public.products p
where p.id in (select distinct product_id from _alias_note_before);

-- 정리 전 목록(보고용)
select 'note 중복 그룹(정리 전)' as 항목, product_id, nc as color_norm, ns as size_norm,
       jsonb_agg(jsonb_build_object('idx', ord - 1, 'color', e->>'color', 'size', e->>'size', 'stock', e->>'stock', 'manual_soldout', manual_soldout) order by ord) as rows
from _alias_note_before group by product_id, nc, ns order by product_id;

select 'PIV 중복 그룹(정리 전)' as 항목, product_id, nc as color_norm, ns as size_norm,
       jsonb_agg(jsonb_build_object('id', id, 'color', color, 'size', size, 'stock', stock) order by id) as rows
from _alias_piv_before group by product_id, nc, ns order by product_id;


-- ── [2] 가드 v2 설치 (같은 트리거 이름, 함수만 교체) ─────────────────────
create or replace function public.ruru_piv_none_alias_guard()
returns trigger
language plpgsql
as $fn$
-- ruru_piv_alias_guard_v2 (2026-10-18)
declare
  v_color_none boolean;
  v_size_none  boolean;
  v_nc text;
  v_ns text;
  v_alias_id bigint;
  v_alias_stock integer;
begin
  v_color_none := coalesce(btrim(new.color), '') in ('', '없음');
  v_size_none  := coalesce(btrim(new.size),  '') in ('', '없음');

  -- 두 축 다 실값 → 바로 통과(향수 세부상품 등, 성능 영향 없음)
  if not (v_color_none or v_size_none) then
    return new;
  end if;

  -- 정확히 같은 키가 이미 있으면 손대지 않음 → 호출 쪽 on conflict 가 지금과 똑같이 동작
  if exists (
    select 1 from public.product_inventory_variants x
     where x.product_id = new.product_id
       and coalesce(x.color, '') = coalesce(new.color, '')
       and coalesce(x.size,  '') = coalesce(new.size,  '')
  ) then
    return new;
  end if;

  v_nc := case when v_color_none then '' else btrim(new.color) end;
  v_ns := case when v_size_none  then '' else btrim(new.size)  end;

  -- ''/'없음' 축은 같게, 실값 축은 정확히 같은 기존 행
  select x.id, coalesce(x.stock, 0) into v_alias_id, v_alias_stock
    from public.product_inventory_variants x
   where x.product_id = new.product_id
     and (case when coalesce(btrim(x.color),'') in ('','없음') then '' else btrim(x.color) end) = v_nc
     and (case when coalesce(btrim(x.size), '') in ('','없음') then '' else btrim(x.size)  end) = v_ns
   order by coalesce(x.stock, 0) desc, x.id asc
   limit 1;

  if v_alias_id is null then
    return new;   -- 진짜로 처음 보는 조합 → 원래대로 생성
  end if;

  if v_color_none and v_size_none then
    -- [08-13 규칙 그대로] 이름 맞추고 들어온 재고는 더한다
    update public.product_inventory_variants
       set color = new.color,
           size  = new.size,
           stock = coalesce(stock, 0) + greatest(0, coalesce(new.stock, 0)),
           updated_at = now()
     where id = v_alias_id;
    return null;
  end if;

  -- [v2] 한 축만 ''/'없음'
  if greatest(0, coalesce(new.stock, 0)) = 0 then
    -- RPC 경로(0으로 넣고 뒤에서 UPDATE): 기존 행(진짜 재고)을 쓴다. 이름만 맞춤, 재고 불변.
    update public.product_inventory_variants
       set color = new.color,
           size  = new.size,
           updated_at = now()
     where id = v_alias_id;
    return null;
  end if;

  if v_alias_stock = 0 then
    -- 기존이 0개 유령 행 → 들어온 이름·재고로 교체(총합 = 들어온 값)
    update public.product_inventory_variants
       set color = new.color,
           size  = new.size,
           stock = greatest(0, coalesce(new.stock, 0)),
           updated_at = now()
     where id = v_alias_id;
    return null;
  end if;

  -- 둘 다 재고 > 0 → 합치면 이중계산/손실 위험 → 지금과 똑같이 새 행 생성
  return new;
end;
$fn$;

drop trigger if exists trg_ruru_piv_none_alias_guard on public.product_inventory_variants;
create trigger trg_ruru_piv_none_alias_guard
  before insert on public.product_inventory_variants
  for each row execute function public.ruru_piv_none_alias_guard();


-- ── [3] 1회 정리 — note ──────────────────────────────────────────────────
--   그룹(같은 상품·''/'없음' 정규화 후 같은 색상·사이즈)마다:
--     · 재고 > 0 줄이 2개 이상 → 손대지 않음(아래 [5] 목록에만)
--     · 재고 > 0 줄이 1개 → 재고 0 줄만 삭제
--     · 전부 0 → 하나만 남김(빈 축 이름이 '없음' 인 줄 우선, 없으면 맨 앞 줄)
--     · 지울 줄에 manual_soldout=true 가 있으면 그 그룹은 손대지 않음([5] 목록)
--   products 갱신 → (켜져 있으면) products 트리거가 PIV 를 note 기준으로 다시 만든다. 위 가드 v2 가 먼저 설치돼 있음.
create temp table _alias_note_drop on commit drop as
with g as (
  select product_id, nc, ns,
         count(*) filter (where has_stock) as pos_cnt
  from _alias_note_before group by 1,2,3
),
cand as (
  select b.*, g.pos_cnt,
         row_number() over (
           partition by b.product_id, b.nc, b.ns
           order by (case when (b.nc = '' and btrim(coalesce(b.e->>'color','')) = '없음')
                           or (b.ns = '' and btrim(coalesce(b.e->>'size','')) = '없음') then 0 else 1 end),
                    b.ord
         ) as keep_rank
  from _alias_note_before b join g using (product_id, nc, ns)
),
to_drop as (
  select * from cand
  where pos_cnt <= 1
    and not has_stock
    and (pos_cnt = 1 or keep_rank > 1)
)
select d.* from to_drop d
where not exists (                       -- manual_soldout 줄을 지워야 하는 그룹은 통째로 보류
  select 1 from to_drop x
   where x.product_id = d.product_id and x.nc = d.nc and x.ns = d.ns and x.manual_soldout
);

update public.products p
set product_note = jsonb_set(
      p.product_note::jsonb,
      '{stock_variants}',
      (
        select coalesce(jsonb_agg(t.e order by t.ord), '[]'::jsonb)
        from jsonb_array_elements(p.product_note::jsonb->'stock_variants') with ordinality as t(e, ord)
        where t.ord not in (select d.ord from _alias_note_drop d where d.product_id = p.id)
      )
    )::text
where p.id in (select distinct product_id from _alias_note_drop);


-- ── [4] 1회 정리 — PIV (products 트리거가 꺼져 있어 남은 것만) ─────────────
create temp table _alias_piv_now on commit drop as
select v.*,
       case when btrim(coalesce(v.color,'')) in ('','없음') then '' else btrim(coalesce(v.color,'')) end as nc,
       case when btrim(coalesce(v.size,'')) in ('','없음') then '' else btrim(coalesce(v.size,'')) end as ns
from public.product_inventory_variants v;

create temp table _alias_piv_drop on commit drop as
with dup as (
  select product_id, nc, ns, count(*) as cnt, count(*) filter (where coalesce(stock,0) > 0) as pos_cnt
  from _alias_piv_now group by 1,2,3 having count(*) > 1
),
cand as (
  select a.*, d.pos_cnt,
         row_number() over (
           partition by a.product_id, a.nc, a.ns
           order by (case when (a.nc = '' and btrim(coalesce(a.color,'')) = '없음')
                           or (a.ns = '' and btrim(coalesce(a.size,'')) = '없음') then 0 else 1 end),
                    a.id
         ) as keep_rank
  from _alias_piv_now a join dup d using (product_id, nc, ns)
)
select * from cand
where pos_cnt <= 1
  and coalesce(stock, 0) = 0
  and (pos_cnt = 1 or keep_rank > 1);

insert into public.ruru_alias_cleanup_backup_20261018 (kind, product_id, piv_row)
select 'piv', d.product_id, to_jsonb(v)
from _alias_piv_drop d join public.product_inventory_variants v on v.id = d.id;

delete from public.product_inventory_variants v
using _alias_piv_drop d
where v.id = d.id and coalesce(v.stock, 0) = 0;


-- ── [5] 정리 후 확인 ─────────────────────────────────────────────────────
-- 5-1) 지운 note 줄 / PIV 행
select 'note 에서 지운 줄' as 항목, product_id, ord - 1 as idx, e->>'color' as color, e->>'size' as size, e->>'stock' as stock
from _alias_note_drop order by product_id, ord;
select 'PIV 에서 지운 행' as 항목, product_id, id, color, size, stock from _alias_piv_drop order by product_id, id;

-- 5-2) 아직 남은 중복(둘 다 재고 있음 / manual_soldout 보류) — 사장님 판단용 목록
with sv as (
  select p.id as product_id, t.ord, t.e,
         case when btrim(coalesce(t.e->>'color','')) in ('','없음') then '' else btrim(coalesce(t.e->>'color','')) end as nc,
         case when btrim(coalesce(t.e->>'size','')) in ('','없음') then '' else btrim(coalesce(t.e->>'size','')) end as ns
  from public.products p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(public.ruru_try_parse_jsonb(p.product_note)->'stock_variants') = 'array'
         then public.ruru_try_parse_jsonb(p.product_note)->'stock_variants' else '[]'::jsonb end
  ) with ordinality as t(e, ord)
)
select 'note 남은 중복(손대지 않음)' as 항목, product_id, nc, ns,
       jsonb_agg(jsonb_build_object('idx', ord - 1, 'color', e->>'color', 'size', e->>'size', 'stock', e->>'stock') order by ord) as rows
from sv group by product_id, nc, ns having count(*) > 1 order by product_id;

-- 5-3) 재고 총합 불변 확인 (정리 대상 상품만, note 기준·PIV 기준)
select '재고 총합 note (정리 전 → 후)' as 항목,
       (select coalesce(sum(case when coalesce(e->>'stock','') ~ '^[0-9]+(\.[0-9]+)?$' then (e->>'stock')::numeric else 0 end),0) from _alias_note_before) as before_dup_rows_sum,
       (select coalesce(sum(case when coalesce(e->>'stock','') ~ '^[0-9]+(\.[0-9]+)?$' then (e->>'stock')::numeric else 0 end),0) from _alias_note_drop) as dropped_sum_should_be_0;
select '재고 총합 PIV 지운 행 합(0이어야 정상)' as 항목, coalesce(sum(stock),0) from _alias_piv_drop;

-- 5-4) 가드 v2 설치됨
select t.tgname, position('ruru_piv_alias_guard_v2' in p.prosrc) > 0 as is_v2
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.product_inventory_variants'::regclass and t.tgname = 'trg_ruru_piv_none_alias_guard';

commit;


-- ── [6] 자가 시뮬레이션 — 항상 rollback (아무것도 안 남김) ────────────────
--   색상 '없음' + 사이즈 실값 행 하나를 골라, RPC 와 똑같이 ('', 사이즈, 0) 을 insert … on conflict do nothing.
--   기대: 행 수 그대로(새 행 안 생김), 재고 그대로, 기존 행 이름이 '' 로 맞춰짐 → NOTICE 「PASS」.
begin;
do $sim$
declare
  v_row record;
  v_cnt_before int;
  v_cnt_after int;
  v_sum_before int;
  v_sum_after int;
  v_exact_found int;
begin
  select id, product_id, color, size, stock into v_row
    from public.product_inventory_variants
   where btrim(coalesce(color,'')) = '없음'
     and btrim(coalesce(size,'')) not in ('', '없음')
     and not exists (
       select 1 from public.product_inventory_variants y
        where y.product_id = product_inventory_variants.product_id
          and coalesce(y.color,'') = '' and y.size = product_inventory_variants.size)
   order by id limit 1;

  if v_row.id is null then
    raise notice 'SKIP: 색상 "없음" + 사이즈 실값 행이 없어 시뮬레이션 대상 없음';
    return;
  end if;

  select count(*), coalesce(sum(stock),0) into v_cnt_before, v_sum_before
    from public.product_inventory_variants where product_id = v_row.product_id;

  insert into public.product_inventory_variants (product_id, color, size, stock)
  values (v_row.product_id, '', v_row.size, 0)
  on conflict (product_id, color, size) do nothing;

  select count(*), coalesce(sum(stock),0) into v_cnt_after, v_sum_after
    from public.product_inventory_variants where product_id = v_row.product_id;
  select count(*) into v_exact_found
    from public.product_inventory_variants
   where product_id = v_row.product_id and color = '' and size = v_row.size;

  if v_cnt_after <> v_cnt_before then
    raise exception 'FAIL: 새 행이 생김 (상품 %, 행 % → %)', v_row.product_id, v_cnt_before, v_cnt_after;
  end if;
  if v_sum_after <> v_sum_before then
    raise exception 'FAIL: 재고 합이 바뀜 (상품 %, % → %)', v_row.product_id, v_sum_before, v_sum_after;
  end if;
  if v_exact_found <> 1 then
    raise exception 'FAIL: 정확일치 조회로 기존 행을 못 찾음 (상품 %)', v_row.product_id;
  end if;
  raise notice 'PASS: 상품 % 사이즈 % — 새 행 없음(% 행 그대로), 재고 합 % 그대로, ('''', %) 로 기존 행 조회됨',
    v_row.product_id, v_row.size, v_cnt_after, v_sum_after, v_row.size;
end
$sim$;
rollback;
