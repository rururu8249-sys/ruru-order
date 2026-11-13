-- Final-write checks remain authoritative even if activity changes during generation.
create or replace function public.live_automation_conversation_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare a public.live_automation_actions; begin
 if new.automation_action_id is null then return new; end if;
 select * into a from public.live_automation_actions where id=new.automation_action_id;
 if a.kind='reply' and not exists(select 1 from public.live_chat_messages m
   where m.id=a.source_message_id and m.broadcast_id=new.broadcast_id and m.hidden_at is null
     and m.automation_actor_id is null and coalesce(m.badge,'')<>'bot' and m.created_at>clock_timestamp()-interval '3 minutes')
 then raise exception 'SOURCE_UNAVAILABLE'; end if;
 if coalesce((a.plan->'facts'->>'ordered')::boolean,false) and not exists(select 1 from public.orders o
   where o.automation_actor_id=a.actor_id and o.created_at>=date_trunc('day',clock_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
 then raise exception 'ORDER_CONTEXT_CHANGED'; end if;
 if a.kind='question' then perform public.live_automation_order_admission(a.campaign_id,(a.plan->>'orderAction')::uuid); end if;
 return new;
end $$;
create trigger live_automation_conversation_guard before insert on public.live_chat_messages
for each row execute function public.live_automation_conversation_guard();

-- OFF, reconnect and broadcast termination also fence uncertain network results.
do $$ declare sig text; original text; source text; begin
 foreach sig in array array['public.live_automation_control(uuid,text,boolean,bigint)','public.live_automation_reconnect(uuid,integer,boolean)','public.live_automation_expire(uuid)'] loop
   select pg_get_functiondef(sig::regprocedure) into original;
   source:=replace(replace(original,'status in (''pending'',''claimed'')','status in (''pending'',''claimed'',''uncertain'')'),'status in(''pending'',''claimed'')','status in(''pending'',''claimed'',''uncertain'')');
   if source=original then raise exception 'STOP_FENCE_PATCH_FAILED: %',sig; end if;
   execute source;
 end loop;
 select pg_get_functiondef('public.live_automation_complete(uuid,uuid,text,jsonb)'::regprocedure) into original;
 source:=replace(original,'if a.manual then','if a.manual and p_status<>''uncertain'' then');
 if source=original then raise exception 'UNCERTAIN_SESSION_PATCH_FAILED'; end if; execute source;
 select pg_get_functiondef('public.live_automation_control(uuid,text,boolean,bigint)'::regprocedure) into original;
 source:=replace(original,'return to_jsonb(c);','perform public.live_automation_notify(p_broadcast); return to_jsonb(c);');
 if source=original then raise exception 'CONTROL_NOTIFY_PATCH_FAILED'; end if; execute source;
 select pg_get_functiondef('public.live_automation_broadcast_end()'::regprocedure) into original;
 source:=replace(original,'c.id is not null and (c.orders_enabled or c.chat_enabled or c.viewers_enabled)','c.id is not null');
 if source=original then raise exception 'BROADCAST_STOP_PATCH_FAILED'; end if; execute source;
 select pg_get_functiondef('public.live_automation_tick_claim(uuid,text,bigint)'::regprocedure) into original;
 source:=replace(original,'''45 seconds''','''90 seconds''');
 if source=original then raise exception 'TICK_LEASE_PATCH_FAILED'; end if; execute source;
 select pg_get_functiondef('public.live_automation_submit(uuid,uuid,bigint,jsonb)'::regprocedure) into original;
 source:=replace(original,'actor.nickname,''운영 확인''','actor.nickname,actor.nickname');
 if source=original then raise exception 'ACTOR_NAME_PATCH_FAILED'; end if; execute source;
end $$;
revoke all on function public.live_automation_conversation_guard() from public,anon,authenticated;
grant execute on function public.live_automation_conversation_guard() to service_role;

create or replace function public.live_automation_order_notice(p_action uuid,p_body text) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare a public.live_automation_actions; ctx jsonb; begin
 perform public.live_automation_identity_lock();
 select * into a from public.live_automation_actions where id=p_action;
 if a.id is null or a.kind<>'order' or a.status<>'succeeded' or length(trim(p_body)) not between 1 and 300 then raise exception 'ORDER_NOT_SAVED'; end if;
 ctx:=public.live_automation_context(a.session_id,a.revision,'order');
 if not exists(select 1 from public.orders where automation_action_id=a.id) then raise exception 'ORDER_NOT_SAVED'; end if;
 perform set_config('ruru.live_automation_notice',a.id::text,true);
 insert into public.live_chat_messages(broadcast_id,kakao_id,nickname,body,badge,bot_ref,automation_session_id,automation_actor_id)
 values((ctx->'campaign'->>'broadcast_id')::uuid,'bot:ruru','루루동이',trim(p_body),'bot','o:'||a.order_group_id,a.session_id,a.actor_id)
 on conflict do nothing;
 perform set_config('ruru.live_automation_notice','',true);
end $$;
do $$ declare original text; source text; begin
 select pg_get_functiondef('public.live_automation_chat_identity_guard()'::regprocedure) into original;
 source:=replace(original,'perform public.live_automation_identity_lock();',
 'perform public.live_automation_identity_lock();
 if new.automation_action_id is null and new.kakao_id=''bot:ruru'' and exists(
   select 1 from public.live_automation_actions a where a.id::text=nullif(current_setting(''ruru.live_automation_notice'',true),'''')
   and a.status=''succeeded'' and a.actor_id=new.automation_actor_id and a.session_id=new.automation_session_id and new.bot_ref=''o:''||a.order_group_id)
 then return new; end if;');
 if source=original then raise exception 'NOTICE_FENCE_PATCH_FAILED'; end if; execute source;
 select pg_get_functiondef('public.live_automation_sparse_chat_guard()'::regprocedure) into original;
 source:=replace(original,'select * into action from public.live_automation_actions where id=new.automation_action_id;',
 'if new.automation_action_id is null and new.kakao_id=''bot:ruru'' and exists(
   select 1 from public.live_automation_actions a where a.id::text=nullif(current_setting(''ruru.live_automation_notice'',true),'''')
   and a.status=''succeeded'' and a.actor_id=new.automation_actor_id and a.session_id=new.automation_session_id and new.bot_ref=''o:''||a.order_group_id)
 then return new; end if;
 select * into action from public.live_automation_actions where id=new.automation_action_id;');
 if source=original then raise exception 'NOTICE_PACING_PATCH_FAILED'; end if; execute source;
end $$;
revoke all on function public.live_automation_order_notice(uuid,text) from public,anon,authenticated;
grant execute on function public.live_automation_order_notice(uuid,text) to service_role;
