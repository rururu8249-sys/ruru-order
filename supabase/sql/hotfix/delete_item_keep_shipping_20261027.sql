-- ============================================================================
-- 2026-10-27 주문상세 「상품 삭제」 때 배송비가 사라지던 것 수정 (사장님 12:17 「수정·추가·삭제하면 배송비가 저절로 없어짐」)
--   Supabase SQL Editor 에서 한 번 Run. 한 트랜잭션 — 문장이 예상과 다르면 예외 → 아무것도 안 바뀜.
--   되돌리기: 맨 아래 주석의 「되돌리기」 블록.
--
-- 원인 (코드 확인)
--   배송비는 주문서의 «한 줄»(보통 첫 상품 줄)에만 붙어 있다(shipping_fee / adjusted_shipping_fee, 그 줄 총액에 포함).
--   admin_delete_order_item 은 그 줄을 통째로 지우면서 배송비를 옮기지 않았다 → 주문 배송비 0원·총액이 배송비만큼 줄어듦.
--   (상품 추가는 새 줄 배송비 0 = 정상, 상품 수정은 그 줄 배송비 그대로 = 정상)
--
-- 무엇을 바꾸나
--   지우는 줄에 배송비가 있으면 «같은 주문서의 남는 줄 하나»(삭제 안 된 줄 중 번호 가장 작은 줄)로 옮긴다:
--   배송비·총액에 더하고 final_amount = 총액 − 사용 포인트(기존 공식 그대로). → 주문서 전체 배송비·총액은 삭제 전과 같음(상품값만 빠짐).
--   배송비 없는 줄을 지울 때·재고 복구·포인트 이관은 지금과 완전히 같음.
-- ============================================================================

begin;

create table if not exists public.ruru_fn_backup_20261027 (
  proname text primary key,
  def text not null,
  saved_at timestamptz not null default now()
);
alter table public.ruru_fn_backup_20261027 enable row level security;

do $do$
declare
  v_def text;
  v_cnt int;
  marker constant text := '[2026-10-27 배송비 보존]';
  pat constant text := $p$delete\s+from\s+public\.orders\s+where\s+id\s*=\s*v_order\.id\s*;$p$;
  rep constant text := $p$-- [2026-10-27 배송비 보존] 지우는 줄의 배송비를 같은 주문서 남는 줄로 옮김(주문 배송비·총액 그대로)
  if coalesce(v_order.order_group_id, '') <> ''
     and coalesce(v_order.adjusted_shipping_fee, v_order.shipping_fee, 0) > 0 then
    update public.orders o
      set shipping_fee = coalesce(o.shipping_fee, 0) + coalesce(v_order.shipping_fee, 0),
          adjusted_shipping_fee = case
            when o.adjusted_shipping_fee is null and v_order.adjusted_shipping_fee is null then null
            else coalesce(o.adjusted_shipping_fee, o.shipping_fee, 0) + coalesce(v_order.adjusted_shipping_fee, v_order.shipping_fee, 0)
          end,
          total_price = coalesce(o.total_price, 0) + coalesce(v_order.adjusted_shipping_fee, v_order.shipping_fee, 0),
          adjusted_total_price = case when o.adjusted_total_price is null then null
            else o.adjusted_total_price + coalesce(v_order.adjusted_shipping_fee, v_order.shipping_fee, 0) end,
          final_amount = case when o.final_amount is null then null
            else greatest(0, coalesce(o.adjusted_total_price, o.total_price, 0)
                             + coalesce(v_order.adjusted_shipping_fee, v_order.shipping_fee, 0)
                             - coalesce(o.point_used_amount, 0)) end
      where o.id = (
        select s.id from public.orders s
        where s.order_group_id = v_order.order_group_id and s.id <> v_order.id
        order by coalesce(s.is_deleted, false), s.id
        limit 1
      );
  end if;
  \&$p$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_delete_order_item';
  if v_def is null then raise exception 'admin_delete_order_item 함수가 없어요 — 아무것도 안 바꿈'; end if;
  if position(marker in v_def) > 0 then
    raise notice '이미 적용돼 있어요 — 건너뜀';
    return;
  end if;
  v_cnt := regexp_count(v_def, pat);
  if v_cnt <> 1 then raise exception '삭제 문장 수가 %건(1건이어야) — 아무것도 안 바꿈', v_cnt; end if;
  insert into public.ruru_fn_backup_20261027 (proname, def) values ('admin_delete_order_item@shipping', v_def)
    on conflict (proname) do nothing;
  execute regexp_replace(v_def, pat, rep);
  raise notice '적용 완료';
end;
$do$;

select position('[2026-10-27 배송비 보존]' in p.prosrc) > 0 as applied
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'admin_delete_order_item';

commit;

-- 되돌리기(필요할 때만, 이 줄들 주석 풀고 실행):
-- do $r$ begin execute (select def from public.ruru_fn_backup_20261027 where proname = 'admin_delete_order_item@shipping'); end $r$;
