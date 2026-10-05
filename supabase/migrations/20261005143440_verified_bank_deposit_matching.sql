-- Do not backfill from created_at: that is import time, not bank transaction time.
alter table public.deposits add column if not exists deposited_at timestamptz;
comment on column public.deposits.deposited_at is 'Verified full bank transaction datetime; null means date unknown, not auto-matchable';

-- One service-only transaction, so a failed/competing claim cannot leave orders paid.
create or replace function public.confirm_verified_bank_match(
  p_order_ids bigint[], p_group_id text, p_deposit_id bigint,
  p_amount bigint, p_expected_orders jsonb, p_expected_deposit jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  d public.deposits%rowtype;
  o public.orders%rowtype;
  expected jsonb;
  stamp timestamptz := clock_timestamp();
  n integer := 0;
  total_amount bigint := 0;
  total_points bigint := 0;
begin
  if cardinality(p_order_ids) is null or cardinality(p_order_ids) = 0 or p_amount is null or p_amount <= 0 or
     p_expected_orders is null or p_expected_deposit is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_candidate');
  end if;
  perform pg_advisory_xact_lock(526870051);
  select * into d from public.deposits where id = p_deposit_id for update;
  if not found or d.confirmed_at is not null or d.match_order_group_id is not null or d.match_customer_id is not null or
     d.amount <> p_amount or d.deposited_at is null or d.deposited_at > stamp or
     d.deposited_at is distinct from (p_expected_deposit->>'deposited_at')::timestamptz or
     not ((to_jsonb(d) - 'deposited_at') @> (p_expected_deposit - 'deposited_at')) then
    return jsonb_build_object('ok', false, 'reason', 'deposit_changed_or_bank_date_unknown');
  end if;
  for o in select * from public.orders where id = any(p_order_ids) order by id for update loop
    select value into expected from jsonb_array_elements(p_expected_orders) where (value->>'id')::bigint = o.id;
    if expected is null or not ((to_jsonb(o) - 'created_at') @> (expected - 'created_at')) or o.deposit_confirmed_at is not null or
       o.created_at is distinct from (expected->>'created_at')::timestamptz or
       o.created_at is null or o.created_at > d.deposited_at or o.is_deleted is true or
       coalesce(nullif(o.order_group_id,''),o.id::text) <> p_group_id or
       coalesce((to_jsonb(o)->>'is_test_order')::boolean,false) or coalesce((to_jsonb(o)->>'exclude_from_payment_match')::boolean,false) or
       coalesce(o.admin_order_status_v2, '') ~ '(입금확인|결제완료|취소|환불|출고완료)' or
       coalesce(o.order_manage_status, '') ~ '(입금확인|결제완료|취소|환불|출고완료)' then
      return jsonb_build_object('ok', false, 'reason', 'order_changed_or_deposit_before_order');
    end if;
    total_amount := total_amount + coalesce(o.final_amount, (to_jsonb(o)->>'adjusted_total_price')::numeric, (to_jsonb(o)->>'total_price')::numeric, 0);
    total_points := total_points + coalesce((to_jsonb(o)->>'point_used_amount')::bigint,0);
    n := n + 1;
  end loop;
  if n <> cardinality(p_order_ids) then
    return jsonb_build_object('ok', false, 'reason', 'order_missing');
  end if;
  if p_amount <> total_amount and p_amount <> total_amount - total_points then
    return jsonb_build_object('ok', false, 'reason', 'group_amount_changed');
  end if;
  if exists (select 1 from public.orders other where other.order_group_id = p_group_id and not (other.id = any(p_order_ids)) and
      other.deposit_confirmed_at is null and other.is_deleted is not true and
      coalesce(other.admin_order_status_v2,'') !~ '(입금확인|결제완료|취소|환불|출고완료)' and
      coalesce(other.order_manage_status,'') !~ '(입금확인|결제완료|취소|환불|출고완료)') then
    return jsonb_build_object('ok', false, 'reason', 'partial_order_group');
  end if;
  update public.deposits set match_order_group_id = p_group_id, match_status = '자동입금확인',
    confirmed_at = stamp, confirmed_note = '자동매칭: 이름·금액 1:1 일치 + 실제 은행 거래일시 검증' where id = p_deposit_id;
  update public.orders set admin_order_status_v2 = '자동입금확인', order_manage_status = '자동입금확인',
    deposit_confirmed_at = stamp where id = any(p_order_ids);
  return jsonb_build_object('ok', true, 'confirmed_at', stamp);
end;
$$;
revoke all on function public.confirm_verified_bank_match(bigint[],text,bigint,bigint,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.confirm_verified_bank_match(bigint[],text,bigint,bigint,jsonb,jsonb) to service_role;

-- Also protect against an older deployed route writing the order before the deposit.
create or replace function public.guard_automatic_bank_confirmation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.admin_order_status_v2 = '자동입금확인' or new.order_manage_status = '자동입금확인') and
     new.deposit_confirmed_at is not null and new.deposit_confirmed_at is distinct from old.deposit_confirmed_at then
    -- Existing point-only zero-payment behavior has no bank transaction to attach.
    if new.final_amount = 0 and coalesce((to_jsonb(new)->>'point_used_amount')::bigint,0) > 0 then return new; end if;
    if not exists (select 1 from public.deposits d where
      d.match_order_group_id = coalesce(nullif(new.order_group_id,''),new.id::text) and
      d.confirmed_at = new.deposit_confirmed_at and d.deposited_at >= new.created_at and
      d.deposited_at <= clock_timestamp() and d.match_status = '자동입금확인') then
      raise exception 'Automatic bank confirmation requires a verified post-order bank transaction';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_guard_automatic_bank_confirmation on public.orders;
create trigger orders_guard_automatic_bank_confirmation before update on public.orders
for each row execute function public.guard_automatic_bank_confirmation();
revoke all on function public.guard_automatic_bank_confirmation() from public, anon, authenticated;
