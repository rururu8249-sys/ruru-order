-- Room-wide speech rhythm, separate from order tempo and free API allowance.
alter table public.live_automation_campaigns add column auto_chat_after timestamptz;
update public.live_automation_campaigns set auto_chat_after=clock_timestamp()+interval '7 minutes' where chat_enabled;
do $$declare original text;changed text;begin
 select pg_get_functiondef('public.live_automation_ai_admission(uuid,text)'::regprocedure) into original;
 changed:=replace(original,'select * into a from public.live_automation_actors where id=p_actor;',
 'select * into a from public.live_automation_actors where id=p_actor;
 if p_kind<>''reply'' and exists(select 1 from public.live_automation_campaigns where id=a.campaign_id and auto_chat_after>t) then raise exception ''ROOM_CHAT_REST'';end if;
 if p_kind<>''reply'' and exists(select 1 from public.live_chat_messages m join public.live_automation_campaigns c on c.broadcast_id=m.broadcast_id where c.id=a.campaign_id and m.automation_actor_id is null and m.badge is distinct from ''bot'' and m.hidden_at is null and m.created_at>t-interval ''90 seconds'') then raise exception ''HUMAN_CONVERSATION_ACTIVE'';end if;');
 if changed=original then raise exception 'ROOM_CHAT_PATCH_DRIFT';end if;execute changed;
end $$;
create or replace function public.live_automation_room_chat_rest() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare a public.live_automation_actions; delay integer;begin
 if new.automation_action_id is null or new.badge='bot' or new.hidden_at is not null then return new;end if;
 select * into a from public.live_automation_actions where id=new.automation_action_id;
 if a.kind not in('chat','question','reply') then return new;end if;
 delay:=case when a.kind='reply' then 180+floor(random()*181)::int when random()<.2 then 900+floor(random()*901)::int else 240+floor(random()*481)::int end;
 update public.live_automation_campaigns set auto_chat_after=greatest(auto_chat_after,clock_timestamp()+make_interval(secs=>delay)) where id=a.campaign_id;
 return new;
end $$;
create trigger live_automation_room_chat_rest after insert on public.live_chat_messages for each row execute function public.live_automation_room_chat_rest();
create or replace function public.live_automation_failed_chat_rest() returns trigger
language plpgsql set search_path=pg_catalog,public as $$begin
 if new.kind in('chat','question','reply') and new.status in('skipped','failed') and old.status is distinct from new.status then
 update public.live_automation_campaigns set auto_chat_after=greatest(auto_chat_after,clock_timestamp()+make_interval(secs=>120+floor(random()*121)::int)) where id=new.campaign_id;
 end if;return new;
end $$;
create trigger live_automation_failed_chat_rest after update of status on public.live_automation_actions for each row execute function public.live_automation_failed_chat_rest();
revoke all on function public.live_automation_room_chat_rest(),public.live_automation_failed_chat_rest() from public,anon,authenticated;
-- Current rehearsal receipt acknowledgement is allowed only for its persisted isolated event.
-- This never writes a bank deposit, marks a real payment, or changes financial exclusion flags.
create or replace function public.live_automation_payment_speech_valid(p_action uuid,p_body text) returns boolean
language sql stable set search_path=pg_catalog,public as $$
 select exists(select 1 from public.live_automation_actions a
 join public.live_automation_payment_events e on e.order_action_id::text=a.plan->'facts'->>'paymentActionId' and e.actor_id=a.actor_id and e.campaign_id=a.campaign_id and e.status='sent'
 join public.orders o on o.automation_action_id=e.order_action_id and o.automation_actor_id=a.actor_id
 where a.id=p_action and a.kind in('chat','reply') and (to_jsonb(o)->>'is_deleted')::boolean is not true
 and o.is_test_order and o.exclude_from_payment_match and o.exclude_from_settlement and o.exclude_from_shipping and o.exclude_from_picking
 and ((e.kind='bank' and p_body~'입금|입완' and p_body!~'결제') or (e.kind='card' and p_body~'결제' and p_body!~'입금|입완')));
$$;
revoke all on function public.live_automation_payment_speech_valid(uuid,text) from public,anon,authenticated;
grant execute on function public.live_automation_payment_speech_valid(uuid,text) to service_role;
do $$declare original text;changed text;begin
 select pg_get_functiondef('public.live_automation_chat(uuid,uuid,bigint,text)'::regprocedure) into original;
 changed:=replace(original,'|결제.{0,3}완료|입금.{0,3}완료','');
 if changed=original then raise exception 'PAYMENT_SPEECH_PATCH_DRIFT';end if;
 changed:=regexp_replace(changed,'if a.kind=''question'' then',
 'if p_body~''입완|(입금|결제).{0,8}(했|완료|끝냈|마쳤|됐|되었)'' and not public.live_automation_payment_speech_valid(a.id,p_body) then raise exception ''PAYMENT_CONTEXT_UNAVAILABLE'';end if;
 if p_body~''첫[[:space:]]*주문|처음.{0,4}주문'' and ((ctx->''actor''->>''order_count'')::integer<>1 or not exists(select 1 from public.orders o where o.automation_actor_id=a.actor_id and (to_jsonb(o)->>''is_deleted'')::boolean is not true)) then raise exception ''FIRST_ORDER_UNVERIFIED'';end if;
 if a.kind=''question'' then');
 execute changed;
end $$;
