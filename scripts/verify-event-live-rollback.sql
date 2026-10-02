-- Run against the operating DB only after inspecting its triggers.
-- Synthetic identity, mode=live / is_test=false, no customer data involved.
-- All writes roll back. Identity sequence values consumed by inserts may leave gaps.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $$
declare b uuid:=gen_random_uuid(); e uuid; w uuid; gift bigint; r jsonb; again jsonb; k text; ledger_before bigint;
begin
 if exists(select 1 from public.orders where id in (-903001,-903002) or customer_phone='00000000000') then raise exception 'Reserved fixture identity already exists'; end if;
 select count(*) into ledger_before from public.customer_point_ledger;
 insert into public.orders(id,created_at,broadcast_id,youtube_nickname,customer_phone,phone,order_group_id,order_lookup_code,product_name,qty,product_price,total_price,final_amount,admin_order_status_v2,exclude_from_settlement,exclude_from_payment_match,exclude_from_shipping,exclude_from_picking)
 overriding system value values(-903001,now()-interval '1 hour',b,'__운영검수_가상참가자','00000000000','00000000000','__event_verify_older','__event_verify_older','__검수_기존상품',1,0,0,0,'미설정',true,true,true,true),
 (-903002,now(),b,'__운영검수_가상참가자','00000000000','00000000000','__event_verify_latest','__event_verify_latest','__검수_최근상품',1,0,0,0,'미설정',true,true,true,true);
 foreach k in array array['survival','race','claw','roulette'] loop
  e:=gen_random_uuid();
  insert into public.event_roulette_events(id,title,overlay_token,mode,is_test,broadcast_id,participant_snapshot)
  values(e,'__운영검수_0P',k||'_validation_'||e,'live',false,b::text,'[{"nickname":"__운영검수_가상참가자","orderIds":["-903001"]}]');
  update public.event_roulette_events set status='result',winner_nickname='__운영검수_가상참가자',spin_started_at=now(),spin_duration_ms=case when k='roulette' then 9200 else 22100 end,result_at=now() where id=e;
  if not exists(select 1 from public.event_roulette_events where id=e and mode='live' and status='result') then raise exception 'Live point result failed';end if;
 end loop;
 e:=gen_random_uuid();
 insert into public.event_roulette_events(id,title,overlay_token,mode,is_test,broadcast_id,custom_gift_name,participant_snapshot)
 values(e,'__운영검수_직접입력','survival_validation_'||e,'live',false,b::text,'__검수_머리끈','[{"nickname":"__운영검수_가상참가자","orderIds":["-903001"]}]');
 r:=public.admin_finalize_custom_gift_event(e,'[{"nickname":"__운영검수_가상참가자","orderIds":["-903001"]}]',now(),22100);
 if not coalesce((r->>'ok')::boolean,false) then raise exception 'Live custom finalization failed: %',r;end if;
 w:=(r->>'winnerId')::uuid;
 r:=public.admin_register_event_custom_gift(w);
 if not coalesce((r->>'ok')::boolean,false) or r->>'orderGroupId'<>'__event_verify_latest' then raise exception 'Latest order gift registration failed: %',r;end if;
 gift:=(r->>'orderId')::bigint;
 if not exists(select 1 from public.orders where id=gift and product_name='__검수_머리끈' and qty=1 and product_price=0 and final_amount=0 and point_used_amount=0 and color is null and size is null) then raise exception 'Gift shape or amount wrong';end if;
 again:=public.admin_register_event_custom_gift(w);
 if again->>'orderId'<>r->>'orderId' or again->>'status'<>'already_added' then raise exception 'Retry duplicated gift';end if;
 update public.orders set is_deleted=true where id=gift;
 again:=public.admin_register_event_custom_gift(w);
 if again->>'targetState'<>'removed' or (select count(*) from public.orders where event_gift_winner_id=w)<>1 then raise exception 'Removed gift recreated';end if;
 if (select count(*) from public.customer_point_ledger)<>ledger_before then raise exception 'Unexpected point ledger write';end if;
end $$;
rollback;
select 'PASS: live 0P results, live custom gift, latest order, qty1/zero/no options, retry, removal, rollback' as verification,
 (select count(*) from public.orders where id in (-903001,-903002) or customer_phone='00000000000') as remaining_fixture_orders,
 (select count(*) from public.event_roulette_events where title like '__운영검수%') as remaining_fixture_events;
