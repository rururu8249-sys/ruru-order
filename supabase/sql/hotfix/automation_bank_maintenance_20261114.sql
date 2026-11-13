-- [2026-11-14 00:15 사장님] 농협 점검 시간: 매일 23:55~00:15, 셋째 월요일 00:00~04:00 — 테스트 무통장 입금확인 알림은 보내지 않고 점검 뒤에 보냄. 카드결제 알림은 언제든. 그 밖은 20261113094047 와 동일.
create or replace function public.live_automation_drain_payments(p_campaign uuid,p_revision bigint) returns integer
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; e public.live_automation_payment_events; msg bigint; body text; n integer:=0; k timestamp; bank_closed boolean; begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 if c.id is null or c.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
 if not c.orders_enabled or not exists(select 1 from public.broadcasts where id=c.broadcast_id and status='ON' and is_deleted is not true) then return 0; end if;
 k:=clock_timestamp() at time zone 'Asia/Seoul';
 bank_closed:=k::time>='23:55' or k::time<'00:15' or (extract(isodow from k)=1 and extract(day from k) between 15 and 21 and k::time<'04:00');
 for e in select * from public.live_automation_payment_events where campaign_id=c.id and status='pending' and due_at<=clock_timestamp() and (kind='card' or not bank_closed) order by due_at limit 3 for update loop
   body:='💗 '||e.nickname||case when e.kind='card' then '님 카드결제 확인! 감사합니다' else '님 입금 확인! 감사합니다' end;
   perform set_config('ruru.live_automation_payment',e.order_action_id::text,true);
   if not public.live_automation_payment_notice_valid(e.order_action_id,e.actor_id,e.session_id,c.broadcast_id,body,'ap:'||e.order_action_id) then
     update public.live_automation_payment_events set status='cancelled' where order_action_id=e.order_action_id; continue;
   end if;
   insert into public.live_chat_messages(broadcast_id,kakao_id,nickname,body,badge,bot_ref,automation_session_id,automation_actor_id,automation_payment_action_id)
   values(c.broadcast_id,'bot:ruru','루루동이',body,'bot','ap:'||e.order_action_id,e.session_id,e.actor_id,e.order_action_id) on conflict do nothing returning id into msg;
   update public.live_automation_payment_events set status='sent',sent_at=clock_timestamp(),message_id=msg where order_action_id=e.order_action_id;
   n:=n+1;
 end loop;
 perform set_config('ruru.live_automation_payment','',true);
 return n;
end $$;
