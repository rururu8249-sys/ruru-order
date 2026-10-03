-- The event roster may intentionally come from the currently filtered order list,
-- which can contain submitted orders from more than one broadcast. The winner's
-- immutable order-id snapshot is the authoritative source for automatic gifts.
create or replace function public.admin_register_event_custom_gift(p_winner_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
 w public.event_roulette_winners%rowtype; e public.event_roulette_events%rowtype;
 r public.event_custom_gift_receipts%rowtype; ref public.orders%rowtype;
 b uuid; owner_id bigint; owner_phone text; owner_count integer; new_id bigint; state text;
begin
 select * into w from public.event_roulette_winners where id=p_winner_id for update;
 select * into r from public.event_custom_gift_receipts where winner_id=p_winner_id;
 if found then
   select case when o.is_deleted or o.is_permanently_deleted then 'removed'
     when not public.event_gift_order_valid(o) then 'canceled' else 'active' end
     into state from public.orders o where o.id=r.order_id;
   return jsonb_build_object('ok',true,'status','already_added','winnerId',p_winner_id,
    'orderId',r.order_id::text,'orderGroupId',r.order_group_id,'lookupCode',r.lookup_code,
    'productName',r.product_name,'targetState',coalesce(state,'removed'));
 end if;
 if w.id is null then return jsonb_build_object('ok',false,'code','WINNER_NOT_FOUND','message','당첨 기록이 없습니다.');end if;
 select * into e from public.event_roulette_events where id=w.event_id;
 if e.id is null or e.custom_gift_name is null or e.is_test or w.is_test or e.mode<>'live' then
   return jsonb_build_object('ok',false,'code','NOT_CUSTOM_LIVE_EVENT','message','실제 직접입력 경품 이벤트만 등록할 수 있습니다.');
 end if;
 if trim(e.custom_gift_name)='' or length(e.custom_gift_name)>40 then raise exception 'Invalid gift name';end if;
 if coalesce(e.broadcast_id,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  return jsonb_build_object('ok',false,'code','BROADCAST_REQUIRED','message','이벤트에 방송이 지정되지 않았습니다.');
 end if;
 b:=e.broadcast_id::uuid;

 -- Automatic rosters carry the exact submitted order ids used for the draw.
 -- Every id must still belong to this winner nickname, but it does not have to
 -- share the event's broadcast id. This keeps cross-broadcast filtered rosters
 -- usable without weakening ownership checks.
 if jsonb_array_length(w.winner_order_ids)>0 then
   if exists(select 1 from jsonb_array_elements_text(w.winner_order_ids) x(id)
     where not exists(select 1 from public.orders o where o.id::text=x.id
      and trim(coalesce(o.youtube_nickname,''))=trim(w.nickname)
      and o.event_gift_winner_id is null)) then
    return jsonb_build_object('ok',false,'code','INVALID_OWNER_SNAPSHOT','message','당첨자의 주문 소유자를 확인할 수 없습니다.');
   end if;
 end if;

 with candidates as (
   select o.customer_id,regexp_replace(coalesce(nullif(o.customer_phone,''),o.phone,''),'[^0-9]','','g') phone
   from public.orders o where o.event_gift_winner_id is null
    and trim(coalesce(o.youtube_nickname,''))=trim(w.nickname)
    and case when jsonb_array_length(w.winner_order_ids)>0 then w.winner_order_ids ? o.id::text
      else o.broadcast_id=b end
 ) select count(distinct case when customer_id is not null then 'id:'||customer_id::text else 'phone:'||phone end),
   min(customer_id),min(phone) into owner_count,owner_id,owner_phone from candidates;
 if owner_count<>1 or (owner_id is null and length(coalesce(owner_phone,''))<10) then
  return jsonb_build_object('ok',false,'code','AMBIGUOUS_CUSTOMER','message','해당 주문 목록에서 주문자를 한 명으로 확인하지 못했습니다.');
 end if;

 if owner_id is null and (select count(distinct o.customer_id) from public.orders o
   where o.event_gift_winner_id is null
    and regexp_replace(coalesce(nullif(o.customer_phone,''),o.phone,''),'[^0-9]','','g')=owner_phone
    and case when jsonb_array_length(w.winner_order_ids)>0 then w.winner_order_ids ? o.id::text
      else o.broadcast_id=b end)>1 then
  return jsonb_build_object('ok',false,'code','AMBIGUOUS_CUSTOMER','message','같은 연락처의 고객이 여러 명입니다.');end if;

 select * into ref from public.orders o where o.event_gift_winner_id is null
  and public.event_gift_order_valid(o)
  and trim(coalesce(o.youtube_nickname,''))=trim(w.nickname)
  and case when jsonb_array_length(w.winner_order_ids)>0 then exists(
    select 1 from jsonb_array_elements_text(w.winner_order_ids) x(id)
    join public.orders source_order on source_order.id::text=x.id
    where source_order.broadcast_id=o.broadcast_id
  ) else o.broadcast_id=b end
  and case when owner_id is not null then o.customer_id=owner_id
   else regexp_replace(coalesce(nullif(o.customer_phone,''),o.phone,''),'[^0-9]','','g')=owner_phone end
  order by o.created_at desc nulls last,o.id desc limit 1 for update;
 if not found then return jsonb_build_object('ok',false,'code','ORDER_NOT_FOUND','message','당첨 주문과 연결된 유효 주문서가 없습니다.');end if;
 if nullif(trim(ref.order_group_id),'') is null and nullif(trim(ref.order_lookup_code),'') is null then
  return jsonb_build_object('ok',false,'code','ORDER_GROUP_UNLINKABLE','message','최신 주문서 연결번호가 없습니다.');end if;

 insert into public.orders (
 created_at,order_group_id,order_lookup_code,broadcast_id,broadcast_name,broadcast_public_title,broadcast_admin_subtitle,
 youtube_nickname,customer_id,customer_name,customer_phone,phone,kakao_id,kakao_nickname,recipient_name,recipient_phone,
 zipcode,address,detail_address,request_memo,payment_method,customer_card_extra_rate_applied,actual_card_fee_rate_applied,
 order_status,admin_status,order_manage_status,admin_order_status_v2,shipping_status,deposit_confirmed_at,
 exclude_from_settlement,exclude_from_payment_match,exclude_from_shipping,exclude_from_picking,
 customer_order_segment,payment_bank_account_id,payment_bank_name,payment_bank_account,payment_bank_holder,payment_bank_assigned_at,
 product_id,product_name,color,size,qty,product_price,adjusted_product_price,shipping_fee,adjusted_shipping_fee,
 original_shipping_fee,final_shipping_fee,vat_amount,total_price,adjusted_total_price,final_amount,
 point_used_amount,point_original_amount,picked_at,event_gift_winner_id,memo,admin_memo
 ) values (
 ref.created_at,ref.order_group_id,ref.order_lookup_code,ref.broadcast_id,ref.broadcast_name,ref.broadcast_public_title,ref.broadcast_admin_subtitle,
 ref.youtube_nickname,ref.customer_id,ref.customer_name,ref.customer_phone,ref.phone,ref.kakao_id,ref.kakao_nickname,ref.recipient_name,ref.recipient_phone,
 ref.zipcode,ref.address,ref.detail_address,ref.request_memo,ref.payment_method,ref.customer_card_extra_rate_applied,ref.actual_card_fee_rate_applied,
 ref.order_status,ref.admin_status,ref.order_manage_status,ref.admin_order_status_v2,ref.shipping_status,ref.deposit_confirmed_at,
 ref.exclude_from_settlement,ref.exclude_from_payment_match,ref.exclude_from_shipping,ref.exclude_from_picking,
 ref.customer_order_segment,ref.payment_bank_account_id,ref.payment_bank_name,ref.payment_bank_account,ref.payment_bank_holder,ref.payment_bank_assigned_at,
 null,e.custom_gift_name,null,null,1,0,0,0,0,0,0,0,0,0,0,0,0,null,p_winner_id,e.custom_gift_name,'이벤트 경품 자동 추가'
 ) returning id into new_id;
 insert into public.event_custom_gift_receipts(winner_id,event_id,order_id,order_group_id,lookup_code,product_name)
 values(p_winner_id,e.id,new_id,ref.order_group_id,ref.order_lookup_code,e.custom_gift_name);
 update public.event_roulette_winners set is_reward_done=true,reward_done_at=now(),updated_at=now() where id=p_winner_id;
 return jsonb_build_object('ok',true,'status','added','winnerId',p_winner_id,'orderId',new_id::text,
 'orderGroupId',ref.order_group_id,'lookupCode',ref.order_lookup_code,'productName',e.custom_gift_name,'targetState','active');
end;
$$;

revoke all on function public.admin_register_event_custom_gift(uuid) from public,anon,authenticated;
grant execute on function public.admin_register_event_custom_gift(uuid) to service_role;
