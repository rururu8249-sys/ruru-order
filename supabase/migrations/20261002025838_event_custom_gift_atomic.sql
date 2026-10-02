-- Direct-input event prizes only. No existing point writer is replaced.
alter table public.event_roulette_events add column if not exists custom_gift_name text;
alter table public.event_roulette_winners add column if not exists winner_order_ids jsonb not null default '[]';
alter table public.orders add column if not exists event_gift_winner_id uuid;
create unique index if not exists orders_event_gift_winner_uidx on public.orders(event_gift_winner_id) where event_gift_winner_id is not null;
create table if not exists public.event_custom_gift_receipts (
 winner_id uuid primary key, event_id uuid not null, order_id bigint not null,
 order_group_id text, lookup_code text, product_name text not null, created_at timestamptz not null default now()
);
alter table public.event_custom_gift_receipts enable row level security;
revoke all on public.event_custom_gift_receipts from public, anon, authenticated;
grant all on public.event_custom_gift_receipts to service_role;

create or replace function public.event_gift_order_valid(o public.orders)
returns boolean language sql immutable security invoker set search_path = public as $$
 select not coalesce(o.is_deleted,false) and not coalesce(o.is_permanently_deleted,false)
 and not coalesce(o.is_test_order,false)
 and coalesce(trim(o.admin_order_status_v2),'') not in ('주문취소','주문서취소')
 and coalesce(trim(o.order_manage_status),'') not in ('주문취소','주문서취소')
 and coalesce(trim(o.order_status),'') not in ('주문취소','주문서취소');
$$;
revoke all on function public.event_gift_order_valid(public.orders) from public, anon, authenticated;
grant execute on function public.event_gift_order_valid(public.orders) to service_role;

create or replace function public.admin_register_event_custom_gift(p_winner_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
 w public.event_roulette_winners%rowtype; e public.event_roulette_events%rowtype;
 r public.event_custom_gift_receipts%rowtype; ref public.orders%rowtype;
 b uuid; owner_id bigint; owner_phone text; owner_count integer; new_id bigint; state text;
begin
 select * into w from public.event_roulette_winners where id=p_winner_id for update;
 -- Receipts survive removed winners/orders and are authoritative on retries.
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
 -- Snapshot order IDs are checked against this broadcast and nickname; never trust client owner data.
 if jsonb_array_length(w.winner_order_ids)>0 then
   if exists(select 1 from jsonb_array_elements_text(w.winner_order_ids) x(id)
     where not exists(select 1 from public.orders o where o.id::text=x.id and o.broadcast_id=b
      and trim(coalesce(o.youtube_nickname,''))=trim(w.nickname) and o.event_gift_winner_id is null)) then
    return jsonb_build_object('ok',false,'code','INVALID_OWNER_SNAPSHOT','message','당첨자의 주문 소유자를 확인할 수 없습니다.');
   end if;
 end if;
 with candidates as (
   select o.customer_id,regexp_replace(coalesce(nullif(o.customer_phone,''),o.phone,''),'[^0-9]','','g') phone
   from public.orders o where o.broadcast_id=b and o.event_gift_winner_id is null
    and trim(coalesce(o.youtube_nickname,''))=trim(w.nickname)
    and (jsonb_array_length(w.winner_order_ids)=0 or w.winner_order_ids ? o.id::text)
 ) select count(distinct case when customer_id is not null then 'id:'||customer_id::text else 'phone:'||phone end),
   min(customer_id),min(phone) into owner_count,owner_id,owner_phone from candidates;
 if owner_count<>1 or (owner_id is null and length(coalesce(owner_phone,''))<10) then
  return jsonb_build_object('ok',false,'code','AMBIGUOUS_CUSTOMER','message','해당 방송 주문자를 한 명으로 확인하지 못했습니다.');
 end if;
 -- A phone shared with another customer ID is not a safe legacy identity.
 if owner_id is null and (select count(distinct o.customer_id) from public.orders o where o.broadcast_id=b
   and regexp_replace(coalesce(nullif(o.customer_phone,''),o.phone,''),'[^0-9]','','g')=owner_phone)>1 then
  return jsonb_build_object('ok',false,'code','AMBIGUOUS_CUSTOMER','message','같은 연락처의 고객이 여러 명입니다.');end if;
 select * into ref from public.orders o where o.broadcast_id=b and o.event_gift_winner_id is null
  and public.event_gift_order_valid(o)
  and case when owner_id is not null then o.customer_id=owner_id
   else regexp_replace(coalesce(nullif(o.customer_phone,''),o.phone,''),'[^0-9]','','g')=owner_phone end
  order by o.created_at desc nulls last,o.id desc limit 1 for update;
 if not found then return jsonb_build_object('ok',false,'code','ORDER_NOT_FOUND','message','해당 방송의 유효 주문서가 없습니다.');end if;
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

create or replace function public.admin_finalize_custom_gift_event(p_event_id uuid,p_winners jsonb,p_started_at timestamptz,p_duration_ms integer)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare e public.event_roulette_events%rowtype; candidate jsonb; participant jsonb; results jsonb;
begin
 select * into e from public.event_roulette_events where id=p_event_id for update;
 if not found or e.custom_gift_name is null then raise exception 'Not a custom gift event';end if;
 if e.status<>'result' then
  if e.status<>'idle' or jsonb_typeof(p_winners)<>'array' or jsonb_array_length(p_winners)<1 then raise exception 'Invalid event state or winners';end if;
  if (select count(distinct x->>'nickname') from jsonb_array_elements(p_winners) x)<>jsonb_array_length(p_winners) then raise exception 'Duplicate winner';end if;
  for candidate in select * from jsonb_array_elements(p_winners) loop
   select x into participant from jsonb_array_elements(e.participant_snapshot) x where x->>'nickname'=candidate->>'nickname';
   if participant is null or coalesce(participant->'orderIds','[]')<>coalesce(candidate->'orderIds','[]') then raise exception 'Winner snapshot mismatch';end if;
   insert into public.event_roulette_winners(event_id,nickname,winner_note,winner_order_ids,winner_at,is_test)
    values(e.id,candidate->>'nickname',e.custom_gift_name,coalesce(participant->'orderIds','[]'),p_started_at,e.is_test);
  end loop;
  update public.event_roulette_events set status='result',winner_nickname=p_winners->0->>'nickname',winner_note=e.custom_gift_name,
   winner_order_ids=coalesce(p_winners->0->'orderIds','[]'),survivor_nicknames=(select jsonb_agg(x->>'nickname') from jsonb_array_elements(p_winners) x),
   winner_count=jsonb_array_length(p_winners),spin_started_at=p_started_at,spin_duration_ms=p_duration_ms,result_at=p_started_at,updated_at=now()
   where id=e.id returning * into e;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('nickname',nickname,'winnerId',id::text,'orderIds',winner_order_ids) order by created_at,id),'[]') into results
  from public.event_roulette_winners where event_id=e.id;
 return jsonb_build_object('ok',true,'event',to_jsonb(e),'winners',results,'winnerId',results->0->>'winnerId',
 'survivors',e.survivor_nicknames,'winner_count',e.winner_count);
end;
$$;
revoke all on function public.admin_finalize_custom_gift_event(uuid,jsonb,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.admin_finalize_custom_gift_event(uuid,jsonb,timestamptz,integer) to service_role;
