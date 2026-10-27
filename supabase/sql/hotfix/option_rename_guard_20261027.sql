-- ============================================================================
-- 2026-10-27 옵션 이름을 바꾼 뒤 옛 이름 주문을 고치거나 취소하면 «유령 재고 줄»이 생기던 것 근본 수정
--   Supabase SQL Editor 에서 한 번 Run. 전체가 한 트랜잭션 — 중간에 하나라도 안 맞으면 아무것도 안 바뀜.
--   되돌리기: supabase/sql/hotfix/option_rename_guard_rollback_20261027.sql
--
-- 무슨 일이 있었나 (꼼데 가디건 10/26)
--   상품 색상 「차콜 핑크셔츠」 → 「차콜 핑크하트」로 이름을 고친 뒤, 셔츠로 들어온 주문 8건을
--   「재고연동 상품수정」으로 핑크하트로 바꿈 → RPC 가 옛 옵션 재고를 «복구»하려고
--   `insert … ('차콜 핑크셔츠', 'M', 0) on conflict do nothing` → 상품에 없는 이름이라 새 줄 생성 → +1
--   → note 로 역동기화 → 손님 화면에 「차콜 핑크셔츠」 칩이 재고와 함께 다시 뜨고 손님이 그걸로 주문.
--   같은 구조: 주문상품 삭제(admin_delete_order_item)·주문서 취소/복구(restore_order_inventory).
--
-- 무엇을 바꾸나 (재고 계산식·금액·주문상태는 한 줄도 안 바꿈 — «없는 이름으로 새 줄 만드는 것»만 막음)
--   [1] 새 함수 ruru_resolve_renamed_option — 옛 옵션 이름 → 지금 이름.
--       상품 note.option_renames(관리자 상품 저장 때 이름 바꿈을 기록, 2026-10-27 화면 배포분)를 따라감.
--       지금 재고표에 있는 이름이면 그대로.
--   [2] 재고연동 상품수정: 옛 옵션이 (이름 바꿈 기록으로도) 상품에 없으면 «바꿀 새 옵션»으로 복구
--       = 이름만 바뀐 같은 물건이라 복구+1·차감−1 이 같은 줄에서 일어나 재고 그대로(유령 줄 없음).
--       새 옵션도 상품에 없으면 저장 거절(안내 문구).
--   [3] 주문상품 삭제: 옛 옵션이 상품에 없으면 삭제 거절 + 「먼저 수정에서 지금 옵션으로 바꾼 뒤 삭제」 안내.
--   [4] 주문서 취소 재고복구 / 취소해제 재차감: 옛 옵션이 상품에 없으면 그 줄만 건너뜀(다른 줄은 정상 처리,
--       주문 취소·복구 자체는 원래도 이 RPC 와 무관하게 처리됨).
--   ※ 옵션이 상품에 «있는» 주문은 지금과 완전히 같은 경로(원래 문장을 그대로 두고 앞에 검사만 붙임).
--   ※ 함수 원문을 서버에서 읽어 해당 문장 앞에만 끼워 넣음. 문장 개수가 예상(1·1·2)과 다르면 예외 → 전체 롤백.
--   ※ 바꾸기 전 원문은 ruru_fn_backup_20261027 표에 저장(되돌리기용, RLS 켬·정책 없음 = 손님 접근 불가).
-- ============================================================================

begin;

-- [0] 백업 표
create table if not exists public.ruru_fn_backup_20261027 (
  proname text primary key,
  def text not null,
  saved_at timestamptz not null default now()
);
alter table public.ruru_fn_backup_20261027 enable row level security;

-- [1] 옛 옵션 이름 → 지금 이름
create or replace function public.ruru_resolve_renamed_option(
  p_product_id bigint, p_color text, p_size text,
  out o_color text, out o_size text)
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_note jsonb;
  v_hit jsonb;
  i int;
begin
  o_color := coalesce(p_color, '');
  o_size := coalesce(p_size, '');
  for i in 1..10 loop
    if exists (
      select 1 from public.product_inventory_variants
      where product_id = p_product_id
        and public.ruru_norm_option(color) = public.ruru_norm_option(o_color)
        and public.ruru_norm_option(size) = public.ruru_norm_option(o_size)
    ) then
      return;
    end if;
    if v_note is null then
      select public.ruru_try_parse_jsonb(product_note::text) into v_note from public.products where id = p_product_id;
      if v_note is null or jsonb_typeof(v_note->'option_renames') is distinct from 'array' then
        return;
      end if;
    end if;
    select e.x into v_hit
    from jsonb_array_elements(v_note->'option_renames') with ordinality as e(x, n)
    where public.ruru_norm_option(e.x->>'from_color') = public.ruru_norm_option(o_color)
      and public.ruru_norm_option(e.x->>'from_size') = public.ruru_norm_option(o_size)
    order by e.n desc
    limit 1;
    if v_hit is null then
      return;
    end if;
    o_color := coalesce(v_hit->>'to_color', '');
    o_size := coalesce(v_hit->>'to_size', '');
    v_hit := null;
  end loop;
end;
$fn$;
revoke all on function public.ruru_resolve_renamed_option(bigint, text, text) from public, anon, authenticated;

-- [2]~[4] 함수 원문에 검사 끼워 넣기
do $do$
declare
  v_def text;
  v_cnt int;
  marker constant text := '[2026-10-27 옵션 이름 바뀜 보호]';

  pat_upd constant text := $p$insert\s+into\s+public\.product_inventory_variants\s*\(\s*product_id\s*,\s*color\s*,\s*size\s*,\s*stock\s*\)\s*values\s*\(\s*v_old_product_id\s*,\s*v_old_color\s*,\s*v_old_size\s*,\s*0\s*\)\s*on\s+conflict\s*\(\s*product_id\s*,\s*color\s*,\s*size\s*\)\s*do\s+nothing\s*;$p$;
  rep_upd constant text := $p$-- [2026-10-27 옵션 이름 바뀜 보호] 옛 옵션이 상품에 없으면 새 줄을 만들지 않고 바꿀 옵션으로 복구
    select r.o_color, r.o_size into v_old_color, v_old_size
      from public.ruru_resolve_renamed_option(v_old_product_id, v_old_color, v_old_size) r;
    if not exists (
      select 1 from public.product_inventory_variants
      where product_id = v_old_product_id
        and public.ruru_norm_option(color) = public.ruru_norm_option(v_old_color)
        and public.ruru_norm_option(size) = public.ruru_norm_option(v_old_size)
    ) then
      if not exists (
        select 1 from public.product_inventory_variants
        where product_id = v_old_product_id
          and public.ruru_norm_option(color) = public.ruru_norm_option(v_new_color)
          and public.ruru_norm_option(size) = public.ruru_norm_option(v_new_size)
      ) then
        raise exception '바꿀 옵션(% / %)이 지금 상품에 없어요. 상품에 있는 옵션으로 골라 주세요.', v_new_color, v_new_size;
      end if;
      v_old_color := v_new_color;
      v_old_size := v_new_size;
    end if;
    \&$p$;

  pat_row constant text := $p$insert\s+into\s+public\.product_inventory_variants\s*\(\s*product_id\s*,\s*color\s*,\s*size\s*,\s*stock\s*\)\s*values\s*\(\s*v_order\.product_id\s*,\s*v_color\s*,\s*v_size\s*,\s*0\s*\)\s*on\s+conflict\s*\(\s*product_id\s*,\s*color\s*,\s*size\s*\)\s*do\s+nothing\s*;$p$;
  rep_del constant text := $p$-- [2026-10-27 옵션 이름 바뀜 보호] 옛 옵션이 상품에 없으면 새 줄을 만들지 않고 안내
      select r.o_color, r.o_size into v_color, v_size
        from public.ruru_resolve_renamed_option(v_order.product_id, v_color, v_size) r;
      if not exists (
        select 1 from public.product_inventory_variants
        where product_id = v_order.product_id
          and public.ruru_norm_option(color) = public.ruru_norm_option(v_color)
          and public.ruru_norm_option(size) = public.ruru_norm_option(v_size)
      ) then
        raise exception '이 주문의 옵션(% / %)이 지금 상품에 없어요(옵션 이름이 바뀐 것 같아요). 먼저 「수정」에서 지금 옵션으로 바꾼 뒤 삭제해 주세요.', v_color, v_size;
      end if;
      \&$p$;
  rep_cancel constant text := $p$-- [2026-10-27 옵션 이름 바뀜 보호] 옛 옵션이 상품에 없으면 새 줄을 만들지 않고 이 줄만 건너뜀
        select r.o_color, r.o_size into v_color, v_size
          from public.ruru_resolve_renamed_option(v_order.product_id, v_color, v_size) r;
        if not exists (
          select 1 from public.product_inventory_variants
          where product_id = v_order.product_id
            and public.ruru_norm_option(color) = public.ruru_norm_option(v_color)
            and public.ruru_norm_option(size) = public.ruru_norm_option(v_size)
        ) then
          v_skipped_count := v_skipped_count + 1;
          continue;
        end if;
        \&$p$;

  fn record;
begin
  for fn in
    select * from (values
      ('admin_update_inventory_linked_order_item', 'upd', 1),
      ('admin_delete_order_item', 'del', 1),
      ('restore_order_inventory', 'cancel', 2)
    ) as t(proname, kind, expected)
  loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn.proname;
    if v_def is null then
      raise exception '% 함수가 없어요 — 아무것도 안 바꿈', fn.proname;
    end if;
    if position(marker in v_def) > 0 then
      raise notice '% 는 이미 적용돼 있어요 — 건너뜀', fn.proname;
      continue;
    end if;
    v_cnt := regexp_count(v_def, case when fn.kind = 'upd' then pat_upd else pat_row end);
    if v_cnt <> fn.expected then
      raise exception '% 문장 수가 %건(%건이어야) — 아무것도 안 바꿈', fn.proname, v_cnt, fn.expected;
    end if;
    insert into public.ruru_fn_backup_20261027 (proname, def) values (fn.proname, v_def)
      on conflict (proname) do nothing;
    v_def := regexp_replace(
      v_def,
      case when fn.kind = 'upd' then pat_upd else pat_row end,
      case fn.kind when 'upd' then rep_upd when 'del' then rep_del else rep_cancel end,
      'g');
    execute v_def;
    raise notice '% 적용', fn.proname;
  end loop;
end;
$do$;

-- 확인: 세 함수에 표시가 들어갔는지
select p.proname, position('[2026-10-27 옵션 이름 바뀜 보호]' in p.prosrc) > 0 as applied
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_update_inventory_linked_order_item', 'admin_delete_order_item', 'restore_order_inventory');

commit;
