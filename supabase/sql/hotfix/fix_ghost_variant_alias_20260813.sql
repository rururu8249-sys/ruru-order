-- ============================================================================
-- 유령 조합 재발 방지 — "없음" 과 빈값을 같은 옵션으로 취급하게 만든다
--   Supabase SQL Editor 에 통째로 붙여넣고 [Run] 한 번.
--   전부 하나의 트랜잭션이라, 중간에 하나라도 실패하면 아무것도 안 바뀝니다.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 무엇을 고치나
-- ─────────────────────────────────────────────────────────────────────────
-- 관리자 폼에서 색상/사이즈를 「🚫 사용 안 함」으로 두면 값이 비는 게 아니라
-- "없음" 이라는 글자가 저장된다. 그런데 주문취소 복구·관리자 주문수정 RPC 4개는
--     if v_color in ('없음','선택안함','-','none','NONE','None') then v_color := ''; end if;
-- 로 "없음" 을 '' 로 바꾼 뒤 product_inventory_variants(PIV) 를 찾는다.
-- → 실제로는 "없음" 글자 그대로 저장돼 있어서 못 찾고,
--   `insert ... on conflict do nothing` 이 **빈 조합 행을 새로 만들어** 거기에 재고를 얹는다.
-- → 그게 note 로 역동기화되어 손님 화면엔 「🔥 기본 N개 남음」 유령 배지가 뜨고,
--   주문제출 RPC 는 ''와 '없음'을 같게 보고 **맨 앞 조합부터** 차감해서
--   유령 조합(재고 0~2)을 먼저 깎다가 「재고가 부족합니다」로 주문을 거부한다.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 어떻게 고치나 (RPC 4개는 한 줄도 안 건드림)
-- ─────────────────────────────────────────────────────────────────────────
-- PIV 테이블에 BEFORE INSERT 트리거를 하나 단다.
--   들어오는 (색상, 사이즈) 가 **둘 다 '' 또는 '없음'** 인 경우에만 동작하고,
--   "없음↔빈값" 만 다른 기존 행이 있으면 → 그 행의 이름을 새 이름으로 바꾸고 INSERT 는 취소.
--   → 뒤이어 RPC 가 하는 `select ... where color=v_color and size=v_size for update` 가
--     **기존 행(진짜 재고)** 을 찾게 되어, 유령 행이 아예 안 생긴다.
--
-- ⚠️ 안전 설계
--   · 색상/사이즈가 실제 값인 행(향수 세부상품 740개 등)은 **첫 줄에서 바로 통과** → 성능 영향 0
--   · 정확히 같은 키가 이미 있으면 기존 `on conflict do nothing` 과 똑같이 INSERT 만 취소
--   · 재고 숫자를 만들거나 지우지 않는다. 이름만 맞춰준다
--   · 되돌리기: 맨 아래 [원복] 두 줄만 실행
--   · 주문/입금/정산/배송/포인트/Bankda 로직·테이블은 읽지도 쓰지도 않는다
-- ============================================================================

begin;

-- ── [0] 실행 전 스냅샷 (문제 있는 상품만) ───────────────────────────────
create temp table _ghost_before on commit drop as
select v.product_id,
       (case when coalesce(trim(v.color),'') = '없음' then '' else coalesce(trim(v.color),'') end) as nc,
       (case when coalesce(trim(v.size), '') = '없음' then '' else coalesce(trim(v.size), '') end) as ns,
       count(*) as rows_cnt,
       sum(coalesce(v.stock,0)) as stock_sum
from public.product_inventory_variants v
where coalesce(trim(v.color),'') in ('', '없음')
  and coalesce(trim(v.size), '') in ('', '없음')
group by 1,2,3
having count(*) > 1;


-- ── [1] 이미 생겨버린 PIV 유령 행 정리 ──────────────────────────────────
--   "없음↔빈값" 만 다른 중복 행들을 한 줄로 합친다(재고는 합계 = 총합 불변).
--   남길 행은 products.product_note 에 실제로 적혀 있는 이름 쪽을 우선한다.
with dup as (
  select v.id, v.product_id, v.color, v.size, coalesce(v.stock,0) as stock,
         (case when coalesce(trim(v.color),'') = '없음' then '' else coalesce(trim(v.color),'') end) as nc,
         (case when coalesce(trim(v.size), '') = '없음' then '' else coalesce(trim(v.size), '') end) as ns
  from public.product_inventory_variants v
  where coalesce(trim(v.color),'') in ('', '없음')
    and coalesce(trim(v.size), '') in ('', '없음')
),
grp as (
  select product_id, nc, ns, count(*) as cnt from dup group by 1,2,3 having count(*) > 1
),
ranked as (
  select d.*,
         row_number() over (
           partition by d.product_id, d.nc, d.ns
           order by
             -- ① note 에 같은 이름으로 적혀 있는 행을 최우선
             (case when exists (
                select 1
                from public.products p,
                     lateral jsonb_array_elements((p.product_note::jsonb)->'stock_variants') sv
                where p.id = d.product_id
                  and coalesce(sv->>'color','') = coalesce(d.color,'')
                  and coalesce(sv->>'size','')  = coalesce(d.size,'')
              ) then 0 else 1 end),
             -- ② 그다음은 재고가 많은 쪽(진짜 재고일 확률이 높음)
             d.stock desc,
             d.id asc
         ) as rn,
         sum(d.stock) over (partition by d.product_id, d.nc, d.ns) as total_stock
  from dup d
  join grp g on g.product_id = d.product_id and g.nc = d.nc and g.ns = d.ns
)
update public.product_inventory_variants v
   set stock = r.total_stock,
       updated_at = now()
  from ranked r
 where v.id = r.id and r.rn = 1;

with dup as (
  select v.id, v.product_id,
         (case when coalesce(trim(v.color),'') = '없음' then '' else coalesce(trim(v.color),'') end) as nc,
         (case when coalesce(trim(v.size), '') = '없음' then '' else coalesce(trim(v.size), '') end) as ns,
         coalesce(v.stock,0) as stock, v.color, v.size
  from public.product_inventory_variants v
  where coalesce(trim(v.color),'') in ('', '없음')
    and coalesce(trim(v.size), '') in ('', '없음')
),
grp as (
  select product_id, nc, ns from dup group by 1,2,3 having count(*) > 1
),
ranked as (
  select d.id,
         row_number() over (
           partition by d.product_id, d.nc, d.ns
           order by
             (case when exists (
                select 1
                from public.products p,
                     lateral jsonb_array_elements((p.product_note::jsonb)->'stock_variants') sv
                where p.id = d.product_id
                  and coalesce(sv->>'color','') = coalesce(d.color,'')
                  and coalesce(sv->>'size','')  = coalesce(d.size,'')
              ) then 0 else 1 end),
             d.stock desc, d.id asc
         ) as rn
  from dup d
  join grp g on g.product_id = d.product_id and g.nc = d.nc and g.ns = d.ns
)
delete from public.product_inventory_variants v
 using ranked r
 where v.id = r.id and r.rn > 1;


-- ── [2] 재발 방지 트리거 ────────────────────────────────────────────────
create or replace function public.ruru_piv_none_alias_guard()
returns trigger
language plpgsql
as $fn$
declare
  v_nc text;
  v_ns text;
  v_alias_id bigint;
begin
  -- 옵션이 진짜 값인 행(향수 세부상품 등)은 여기서 바로 통과 — 성능 영향 없음
  if not ( coalesce(trim(new.color), '') in ('', '없음')
       and coalesce(trim(new.size),  '') in ('', '없음') ) then
    return new;
  end if;

  -- 정확히 같은 키가 이미 있으면 손대지 않고 그대로 통과시킨다.
  --   → 호출한 쪽의 `on conflict do nothing` / `do update set stock=excluded.stock` 이
  --     지금까지와 **똑같이** 동작한다(관리자 재고 수정이 막히지 않게 하는 핵심).
  if exists (
    select 1 from public.product_inventory_variants x
     where x.product_id = new.product_id
       and coalesce(x.color, '') = coalesce(new.color, '')
       and coalesce(x.size,  '') = coalesce(new.size,  '')
  ) then
    return new;
  end if;

  v_nc := case when coalesce(trim(new.color), '') = '없음' then '' else coalesce(trim(new.color), '') end;
  v_ns := case when coalesce(trim(new.size),  '') = '없음' then '' else coalesce(trim(new.size),  '') end;

  -- "없음↔빈값" 만 다른 기존 행이 있으면 → 같은 옵션으로 보고 그 행의 이름을 새 이름으로 바꾼다.
  select x.id into v_alias_id
    from public.product_inventory_variants x
   where x.product_id = new.product_id
     and coalesce(trim(x.color), '') in ('', '없음')
     and coalesce(trim(x.size),  '') in ('', '없음')
     and (case when coalesce(trim(x.color),'') = '없음' then '' else coalesce(trim(x.color),'') end) = v_nc
     and (case when coalesce(trim(x.size), '') = '없음' then '' else coalesce(trim(x.size), '') end) = v_ns
   order by coalesce(x.stock, 0) desc, x.id asc
   limit 1;

  if v_alias_id is not null then
    -- 이름을 맞추고, 들어온 재고는 **더한다**.
    --   · RPC 경로는 항상 stock=0 으로 넣고 뒤에서 UPDATE 하므로 → +0, 진짜 재고 그대로 보존
    --   · note→PIV 동기화처럼 실제 수량을 들고 오는 경우 → 합계가 되어 재고가 사라지지 않음
    update public.product_inventory_variants
       set color = new.color,
           size  = new.size,
           stock = coalesce(stock, 0) + greatest(0, coalesce(new.stock, 0)),
           updated_at = now()
     where id = v_alias_id;
    return null;   -- 유령 행을 새로 만들지 않는다 (유니크 위반도 원천 차단)
  end if;

  return new;      -- 진짜로 처음 보는 조합이면 원래대로 생성
end;
$fn$;

drop trigger if exists trg_ruru_piv_none_alias_guard on public.product_inventory_variants;
create trigger trg_ruru_piv_none_alias_guard
  before insert on public.product_inventory_variants
  for each row execute function public.ruru_piv_none_alias_guard();


-- ── [3] 실행 결과 확인 ──────────────────────────────────────────────────
select '정리 전 중복 그룹' as 항목, count(*)::text as 값 from _ghost_before
union all
select '정리 후 중복 그룹', count(*)::text from (
  select 1 from public.product_inventory_variants v
  where coalesce(trim(v.color),'') in ('', '없음')
    and coalesce(trim(v.size), '') in ('', '없음')
  group by v.product_id,
    (case when coalesce(trim(v.color),'') = '없음' then '' else coalesce(trim(v.color),'') end),
    (case when coalesce(trim(v.size), '') = '없음' then '' else coalesce(trim(v.size), '') end)
  having count(*) > 1
) q
union all
select '재고 총합 변화(0이어야 정상)',
       coalesce((
         select sum(v.stock) from public.product_inventory_variants v
          where v.product_id in (select product_id from _ghost_before)
       ), 0)::text || ' / 정리전 ' ||
       coalesce((select sum(stock_sum) from _ghost_before), 0)::text
union all
select '트리거 설치됨',
       (select count(*)::text from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
        where c.relname = 'product_inventory_variants'
          and t.tgname = 'trg_ruru_piv_none_alias_guard');

commit;


-- ============================================================================
-- [원복] 문제가 생기면 이 두 줄만 실행하세요 (재고 데이터는 그대로 남습니다)
-- ----------------------------------------------------------------------------
-- drop trigger if exists trg_ruru_piv_none_alias_guard on public.product_inventory_variants;
-- drop function if exists public.ruru_piv_none_alias_guard();
-- ============================================================================
