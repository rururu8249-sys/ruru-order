-- Additive function only. No existing customer records are rewritten.
-- Preserve the established one-reclaim-per-group policy, including legacy rows.
create or replace function public.reclaim_order_return_points(
  p_phone text, p_group_id text, p_amount integer,
  p_nickname text, p_customer_name text, p_memo text
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_balance public.customer_point_balances%rowtype;
  v_prior public.customer_point_ledger%rowtype;
  v_next bigint;
begin
  if p_phone is null or p_phone !~ '^[0-9]{10,15}$'
    or nullif(btrim(p_group_id),'') is null or length(p_group_id)>200
    or p_amount is null or p_amount<=0 then
    return jsonb_build_object('ok',false,'message','포인트 회수 요청 값이 올바르지 않습니다.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order_return_flow:' || p_group_id,0));
  select * into v_prior from public.customer_point_ledger
    where related_order_id=p_group_id and created_by='order_return_flow'
    order by created_at,id limit 1;
  if found then
    if v_prior.customer_phone<>p_phone then
      return jsonb_build_object('ok',false,'message','기존 회수 내역의 고객이 달라 확인이 필요합니다.');
    end if;
    return jsonb_build_object('ok',true,'duplicate',true,'reclaimed',0,
      'balance_after',null,'message','이미 회수한 주문그룹 — 이번엔 회수하지 않았습니다.');
  end if;
  select * into v_balance from public.customer_point_balances
    where customer_phone=p_phone for update;
  if not found then
    return jsonb_build_object('ok',false,'message','포인트 잔액을 확인하지 못해 변경하지 않았습니다.');
  end if;
  v_next:=v_balance.current_points::bigint-p_amount;
  if v_next < -2147483648 or v_balance.total_canceled_points::bigint+p_amount>2147483647 then
    return jsonb_build_object('ok',false,'message','포인트 기록 한도를 초과해 확인이 필요합니다.');
  end if;
  insert into public.customer_point_ledger(
    customer_phone,youtube_nickname,customer_name,change_type,amount,balance_after,
    reason,admin_memo,related_order_id,customer_visible,created_by
  ) values(p_phone,nullif(p_nickname,''),nullif(p_customer_name,''),'cancel',-p_amount,v_next::integer,
    '반품(환불) 적립 포인트 회수',left(p_memo,500),p_group_id,true,'order_return_flow');
  update public.customer_point_balances set
    current_points=v_next::integer,
    total_canceled_points=total_canceled_points+p_amount,
    youtube_nickname=coalesce(nullif(p_nickname,''),youtube_nickname),
    customer_name=coalesce(nullif(p_customer_name,''),customer_name),
    updated_at=now()
    where customer_phone=p_phone;
  return jsonb_build_object('ok',true,'duplicate',false,'reclaimed',p_amount,'balance_after',v_next);
end;
$$;
revoke all on function public.reclaim_order_return_points(text,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.reclaim_order_return_points(text,text,integer,text,text,text) to service_role;
