-- Preserve recorded reclaim amounts; never infer or recalculate a refund amount.
create or replace function public.undo_order_return_points(
  p_phone text,p_group_id text,p_nickname text,p_customer_name text,p_memo text
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_balance public.customer_point_balances%rowtype;
  v_amount bigint;
  v_next bigint;
begin
  if p_phone is null or p_phone !~ '^[0-9]{10,15}$'
    or nullif(btrim(p_group_id),'') is null or length(p_group_id)>200 then
    return jsonb_build_object('ok',false,'message','포인트 반환 요청 값이 올바르지 않습니다.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order_return_flow:'||p_group_id,0));
  if exists(select 1 from public.customer_point_ledger where related_order_id=p_group_id
    and created_by in ('order_return_flow','order_return_undo') and customer_phone<>p_phone) then
    return jsonb_build_object('ok',false,'message','기존 포인트 내역의 고객이 달라 확인이 필요합니다.');
  end if;
  if exists(select 1 from public.customer_point_ledger where related_order_id=p_group_id and created_by='order_return_undo') then
    return jsonb_build_object('ok',true,'duplicate',true,'refunded',0,'message','이미 되돌린 건이라 포인트를 다시 지급하지 않았습니다.');
  end if;
  select coalesce(sum(greatest(0,-amount::bigint)),0) into v_amount from public.customer_point_ledger
    where related_order_id=p_group_id and created_by='order_return_flow';
  if v_amount=0 then
    return jsonb_build_object('ok',true,'refunded',0,'message','회수된 포인트가 없어 반환하지 않았습니다.');
  end if;
  select * into v_balance from public.customer_point_balances where customer_phone=p_phone for update;
  if not found then
    return jsonb_build_object('ok',false,'message','포인트 잔액을 확인하지 못해 변경하지 않았습니다.');
  end if;
  v_next:=v_balance.current_points::bigint+v_amount;
  if v_amount>2147483647 or v_next>2147483647 then
    return jsonb_build_object('ok',false,'message','포인트 한도를 초과해 확인이 필요합니다.');
  end if;
  insert into public.customer_point_ledger(
    customer_phone,youtube_nickname,customer_name,change_type,amount,balance_after,
    reason,admin_memo,related_order_id,customer_visible,created_by,source_key
  ) values(p_phone,nullif(p_nickname,''),nullif(p_customer_name,''),'adjust',v_amount::integer,v_next::integer,
    '반품/교환 등록 취소 — 회수 포인트 반환',left(p_memo,500),p_group_id,true,'order_return_undo','order_return_undo:'||p_group_id);
  update public.customer_point_balances set current_points=v_next::integer,
    youtube_nickname=coalesce(nullif(p_nickname,''),youtube_nickname),
    customer_name=coalesce(nullif(p_customer_name,''),customer_name),updated_at=now()
    where customer_phone=p_phone;
  return jsonb_build_object('ok',true,'duplicate',false,'refunded',v_amount,'balance_after',v_next);
end;
$$;
revoke all on function public.undo_order_return_points(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.undo_order_return_points(text,text,text,text,text) to service_role;
