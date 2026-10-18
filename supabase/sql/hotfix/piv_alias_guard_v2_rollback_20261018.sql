-- ============================================================================
-- ㉟ 원복 — piv_alias_guard_v2_20261018.sql 되돌리기
--   [1] 가드 함수를 08-13 원래 버전(두 축 다 ''/'없음' 일 때만)으로 되돌림 — 같은 트리거 이름.
--   [2] (선택) 1회 정리로 지운 note 줄·PIV 행을 백업에서 되살림 — 기본 꺼짐.
--       ⚠ 되살리면 유령줄(0개)도 같이 돌아온다. 꼭 필요할 때만 restore_data := true 로 바꿔 실행.
--   재고 RPC·주문 제출 RPC 는 v2 에서도 안 건드렸으므로 되돌릴 것 없음.
-- ============================================================================

begin;

-- [1] 08-13 가드 원문 그대로 (supabase/sql/hotfix/fix_ghost_variant_alias_20260813.sql 의 [2])
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
    update public.product_inventory_variants
       set color = new.color,
           size  = new.size,
           stock = coalesce(stock, 0) + greatest(0, coalesce(new.stock, 0)),
           updated_at = now()
     where id = v_alias_id;
    return null;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_ruru_piv_none_alias_guard on public.product_inventory_variants;
create trigger trg_ruru_piv_none_alias_guard
  before insert on public.product_inventory_variants
  for each row execute function public.ruru_piv_none_alias_guard();

-- [2] (선택) 데이터 되살리기 — 기본 꺼짐
do $restore$
declare
  restore_data boolean := false;   -- ← 되살리려면 true
begin
  if not restore_data then
    raise notice '데이터 되살리기는 건너뜀(restore_data = false). 가드만 08-13 버전으로 되돌렸습니다.';
    return;
  end if;
  if to_regclass('public.ruru_alias_cleanup_backup_20261018') is null then
    raise notice '백업 테이블이 없어 되살릴 것이 없습니다.';
    return;
  end if;

  -- note 원문 복원(상품마다 가장 먼저 백업된 원문). products 트리거가 켜져 있으면 PIV 도 note 기준으로 다시 만들어진다.
  update public.products p
     set product_note = b.product_note
    from (
      select distinct on (product_id) product_id, product_note
        from public.ruru_alias_cleanup_backup_20261018
       where kind = 'note'
       order by product_id, backup_id
    ) b
   where p.id = b.product_id;

  -- products 트리거가 꺼져 있던 경우를 위해 지운 PIV 행도 되살림(이미 있으면 건너뜀)
  insert into public.product_inventory_variants (product_id, color, size, stock)
  select (piv_row->>'product_id')::bigint, piv_row->>'color', piv_row->>'size', coalesce((piv_row->>'stock')::int, 0)
    from public.ruru_alias_cleanup_backup_20261018
   where kind = 'piv'
  on conflict (product_id, color, size) do nothing;
end
$restore$;

-- 확인
select t.tgname, position('ruru_piv_alias_guard_v2' in p.prosrc) > 0 as is_v2_still
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.product_inventory_variants'::regclass and t.tgname = 'trg_ruru_piv_none_alias_guard';

commit;
