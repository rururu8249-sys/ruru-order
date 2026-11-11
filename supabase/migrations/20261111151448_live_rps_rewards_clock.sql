-- Exact participant identity, one event winner receipt, always zero price/shipping.
create or replace function public.rps_gift(p_player uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare p rps_players%rowtype; r rps_rooms%rowtype; c customers%rowtype; oid bigint; grp text; code text; gift_name text;
begin
 select * into p from rps_players where id=p_player for update;
 select * into r from rps_rooms where id=p.room_id;
 if not p.winner or r.status not in ('finished','closed') or r.is_test or r.reward_kind<>'gift' or p.winner_id is null then raise exception '실제 경품 당첨자만 등록할 수 있습니다.';end if;
 -- Same winner lock/receipt as the existing event gift action.
 perform 1 from event_roulette_winners where id=p.winner_id for update;
 select order_id into oid from event_custom_gift_receipts where winner_id=p.winner_id;
 if found then
 if not exists(select 1 from orders where id=oid and customer_id=p.customer_id and kakao_id=p.kakao_id) then raise exception '경품 주문 소유자 확인 필요';end if;
 return jsonb_build_object('ok',true,'status','already_added','orderId',oid::text);end if;
 select * into c from customers where id=p.customer_id and kakao_id=p.kakao_id;
 if c.id is null or nullif(trim(c.customer_name),'') is null or length(regexp_replace(coalesce(c.customer_phone,''),'[^0-9]','','g'))<10 or nullif(trim(c.address),'') is null or nullif(trim(c.zipcode),'') is null then
 return jsonb_build_object('ok',false,'message','내정보의 이름·연락처·배송지를 확인해 주세요.');end if;
 grp:=gen_random_uuid()::text;code:='RPS-'||replace(grp,'-','');gift_name:='[이벤트선물] '||r.gift;
 insert into orders(created_at,order_group_id,order_lookup_code,broadcast_id,youtube_nickname,customer_id,customer_name,customer_phone,phone,kakao_id,
 recipient_name,recipient_phone,zipcode,address,detail_address,product_name,qty,product_price,adjusted_product_price,shipping_fee,adjusted_shipping_fee,original_shipping_fee,final_shipping_fee,vat_amount,total_price,adjusted_total_price,final_amount,
 payment_method,order_status,admin_status,order_manage_status,admin_order_status_v2,shipping_status,deposit_confirmed_at,
 exclude_from_settlement,exclude_from_payment_match,event_gift_winner_id,memo,admin_memo)
 values(clock_timestamp(),grp,code,r.broadcast_id,p.nickname,c.id,c.customer_name,c.customer_phone,c.customer_phone,p.kakao_id,
 c.customer_name,c.customer_phone,c.zipcode,c.address,c.detail_address,gift_name,1,0,0,0,0,0,0,0,0,0,0,
 '이벤트','주문완료','입금완료','입금완료','입금완료','합배송중',clock_timestamp(),true,true,p.winner_id,r.title,'가위·바위·보 경품 자동 접수 · 상품/배송비 0원') returning id into oid;
 insert into event_custom_gift_receipts(winner_id,event_id,order_id,order_group_id,lookup_code,product_name) values(p.winner_id,r.event_id,oid,grp,code,gift_name);
 update event_roulette_winners set is_reward_done=true,reward_done_at=clock_timestamp(),updated_at=clock_timestamp() where id=p.winner_id;
 return jsonb_build_object('ok',true,'status','added','orderId',oid::text,'orderGroupId',grp,'lookupCode',code,'productName',gift_name);
end $$;
revoke all on function public.rps_gift(uuid) from public,anon,authenticated;
grant execute on function public.rps_gift(uuid) to service_role;

-- Preserve the existing endpoint while routing RPS winners through exact identity.
alter function public.admin_register_event_custom_gift(uuid) rename to admin_register_event_custom_gift_before_rps;
create or replace function public.admin_register_event_custom_gift(p_winner_id uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare p rps_players%rowtype; answer jsonb;
begin
 select * into p from rps_players where winner_id=p_winner_id for update;
 if found then
 answer:=rps_gift(p.id);
 if coalesce((answer->>'ok')::boolean,false) then update rps_players set reward_status='done',reward_message='' where id=p.id;end if;
 return answer;
 end if;
 return admin_register_event_custom_gift_before_rps(p_winner_id);
end $$;
revoke all on function public.admin_register_event_custom_gift(uuid) from public,anon,authenticated;
grant execute on function public.admin_register_event_custom_gift(uuid) to service_role;

create or replace function public.rps_claim_self(p_room uuid,p_kakao text,p_phone text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare p rps_players%rowtype;
begin
 perform 1 from rps_rooms where id=p_room and status in ('finished','closed') for update;
 if not found then raise exception '종료된 게임의 당첨 보상만 확인할 수 있어요.';end if;
 select * into p from rps_players where room_id=p_room and kakao_id=p_kakao and winner for update;
 if not found then raise exception '당첨 기록을 확인할 수 없어요.';end if;
 if p.verified_phone='' and length(coalesce(p_phone,''))>=10 then update rps_players set verified_phone=p_phone where id=p.id;end if;
 update rps_players set reward_status='pending',reward_retry_at=null where id=p.id and reward_status='needs_info';
 perform rps_reward(p_room);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.rps_claim_self(uuid,text,text) from public,anon,authenticated;
grant execute on function public.rps_claim_self(uuid,text,text) to service_role;

-- HOSTED CLOCK
-- Database clock continues even when the host's browser disconnects.
create extension if not exists pg_cron;
select cron.schedule('ruru-rps-clock','1 second','select public.rps_tick()');
-- Bound this job's logs; do not touch logs belonging to other jobs.
select cron.schedule('ruru-rps-clock-history','15 19 * * *', $job$delete from cron.job_run_details where jobid=(select jobid from cron.job where jobname='ruru-rps-clock') and end_time<now()-interval '2 days'$job$);
