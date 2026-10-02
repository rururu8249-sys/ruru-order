-- One transaction owns both ledger and balance. No compensating HTTP deletion.
create or replace function public.admin_change_customer_points(
  p_phone text, p_action text, p_amount integer, p_reason text,
  p_admin_memo text, p_nickname text, p_customer_name text,
  p_customer_visible boolean, p_source_key text
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_balance public.customer_point_balances%rowtype;
  v_existing public.customer_point_ledger%rowtype;
  v_key text := nullif(btrim(p_source_key), '');
  v_signed integer;
  v_next bigint;
  v_id uuid := gen_random_uuid();
begin
  if p_phone is null or p_phone !~ '^[0-9]{10,15}$'
     or p_action is null or p_action not in ('grant','deduct')
     or p_amount is null or p_amount < 1 or p_amount > 10000000
     or nullif(btrim(p_reason),'') is null or length(p_reason) > 200
     or length(v_key) > 200 then
    return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','포인트 요청 값이 올바르지 않습니다.');
  end if;
  v_signed := case when p_action='grant' then p_amount else -p_amount end;
  -- Same source is serialized even when it is sent for different customers.
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('admin_points_source:' || v_key,0));
    select * into v_existing from public.customer_point_ledger where source_key=v_key;
    if found then
      if v_existing.customer_phone<>p_phone or v_existing.amount<>v_signed
         or v_existing.change_type<>(case when p_action='grant' then 'grant' else 'adjust' end) then
        return jsonb_build_object('ok',false,'code','SOURCE_KEY_CONFLICT','message','같은 지급 식별자로 다른 고객이나 금액을 처리할 수 없습니다.');
      end if;
      return jsonb_build_object('ok',true,'duplicate',true,'phone',p_phone,
        'source_key',v_key,'ledger_id',v_existing.id,'amount',v_existing.amount,
        'current_points_after',v_existing.balance_after);
    end if;
  end if;
  -- This also serializes first-ever grants: concurrent insertion waits for commit.
  insert into public.customer_point_balances(customer_phone) values(p_phone)
    on conflict(customer_phone) do nothing;
  select * into strict v_balance from public.customer_point_balances
    where customer_phone=p_phone for update;
  v_next := v_balance.current_points::bigint + v_signed;
  if v_next < 0 then
    return jsonb_build_object('ok',false,'code','INSUFFICIENT_POINTS','message','현재 포인트가 부족합니다.');
  end if;
  if v_next > 2147483647 then
    return jsonb_build_object('ok',false,'code','POINT_LIMIT','message','포인트 잔액 한도를 초과합니다.');
  end if;
  insert into public.customer_point_ledger(
    id,customer_phone,youtube_nickname,customer_name,change_type,amount,balance_after,
    reason,admin_memo,customer_visible,created_by,source_key
  ) values(v_id,p_phone,nullif(p_nickname,''),nullif(p_customer_name,''),
    case when p_action='grant' then 'grant' else 'adjust' end,v_signed,v_next::integer,
    p_reason,nullif(p_admin_memo,''),coalesce(p_customer_visible,true),'admin',v_key);
  update public.customer_point_balances set
    current_points=v_next::integer,
    total_granted_points=total_granted_points+case when p_action='grant' then p_amount else 0 end,
    total_adjusted_points=total_adjusted_points+case when p_action='deduct' then v_signed else 0 end,
    youtube_nickname=coalesce(nullif(p_nickname,''),youtube_nickname),
    customer_name=coalesce(nullif(p_customer_name,''),customer_name),
    admin_memo=coalesce(nullif(p_admin_memo,''),admin_memo),
    last_granted_at=case when p_action='grant' then now() else last_granted_at end
    where customer_phone=p_phone;
  return jsonb_build_object('ok',true,'phone',p_phone,'action',p_action,
    'change_type',case when p_action='grant' then 'grant' else 'adjust' end,
    'amount',v_signed,'requested_amount',p_amount,'current_points_before',v_balance.current_points,
    'current_points_after',v_next,'ledger_id',v_id,
    'balance',(select to_jsonb(b) from public.customer_point_balances b where customer_phone=p_phone));
end;
$$;
revoke all on function public.admin_change_customer_points(text,text,integer,text,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.admin_change_customer_points(text,text,integer,text,text,text,text,boolean,text) to service_role;
