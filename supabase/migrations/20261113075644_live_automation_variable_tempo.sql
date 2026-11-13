-- Persistent variable activity tempo. These are initial operational limits, not fixed send intervals.
alter table public.live_automation_campaigns add column tempo_plan jsonb;
alter table public.live_automation_actors add column proactive_quiet_until timestamptz;

create or replace function public.live_automation_plan_tempo(p_campaign uuid,p_quiet boolean default false) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; mode text; pick double precision:=random(); delay integer; offsets jsonb; plan jsonb; begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 if c.id is null then raise exception 'NO_CAMPAIGN'; end if;
 if not c.orders_enabled then
   update public.live_automation_campaigns set next_order_at=null,tempo_plan=null where id=c.id; return null;
 end if;
 mode:=case when p_quiet or c.tempo_plan->>'mode'='burst' or pick<.35 then 'quiet' when pick<.85 then 'steady' else 'burst' end;
 delay:=case mode when 'quiet' then 480+floor(random()*721)::int when 'steady' then 60+floor(random()*301)::int else 15+floor(random()*31)::int end;
 if mode='burst' then
   select jsonb_agg(offset_ms order by offset_ms) into offsets from (select floor(random()*45001)::int offset_ms from generate_series(1,2+floor(random()*2)::int)) x;
 else offsets:='[0]'::jsonb; end if;
 plan:=jsonb_build_object('id',gen_random_uuid(),'mode',mode,'at',clock_timestamp()+make_interval(secs=>delay),'offsets',offsets,'revision',c.revision);
 update public.live_automation_campaigns set tempo_plan=plan,next_order_at=(plan->>'at')::timestamptz where id=c.id;
 return plan;
end $$;

create or replace function public.live_automation_order_admission(p_campaign uuid,p_action uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
begin
 perform public.live_automation_identity_lock();
 if (select count(*) from public.live_automation_actions where campaign_id=p_campaign and kind='order' and not manual
   and ((status='succeeded' and completed_at>clock_timestamp()-interval '1 hour')
     or (id is distinct from p_action and asked_at is not null and status in('pending','claimed','uncertain'))))>=20
 then raise exception 'ORDER_HOURLY_LIMIT'; end if;
 if (select count(*) from public.live_automation_actions where campaign_id=p_campaign and kind='order' and status='claimed' and id is distinct from p_action
   and lease_until>clock_timestamp())>=3 then raise exception 'ORDER_CONCURRENCY_LIMIT'; end if;
end $$;
create or replace function public.live_automation_after_submit(p_campaign uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.live_automation_actions where campaign_id=p_campaign and kind='order' and not manual and status in('pending','claimed','uncertain')) then
   perform public.live_automation_plan_tempo(p_campaign,false);
 end if;
end $$;

create or replace function public.live_automation_ai_admission(p_actor uuid,p_kind text) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare a public.live_automation_actors; t timestamptz:=clock_timestamp(); total_minute integer; proactive_minute integer; proactive_hour integer; begin
 perform public.live_automation_assert_ai(p_actor);
 select * into a from public.live_automation_actors where id=p_actor;
 if p_kind not in('reply','chat','question') then raise exception 'INVALID_AI_KIND'; end if;
 select count(*) filter(where m.created_at>t-interval '1 minute'),
   count(*) filter(where m.created_at>t-interval '1 minute' and x.kind<>'reply'),
   count(*) filter(where x.kind<>'reply')
 into total_minute,proactive_minute,proactive_hour
 from public.live_chat_messages m join public.live_automation_actions x on x.id=m.automation_action_id
 where x.campaign_id=a.campaign_id and m.created_at>t-interval '1 hour';
 if total_minute>=2 then raise exception 'CHAT_MINUTE_LIMIT'; end if;
 if p_kind<>'reply' and (proactive_minute>=1 or proactive_hour>=6 or a.proactive_quiet_until>t) then raise exception 'CHAT_QUIET_WINDOW'; end if;
end $$;

create or replace function public.live_automation_sparse_chat_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare action public.live_automation_actions; begin
 if new.automation_actor_id is null or new.automation_manual_request_id is not null then return new; end if;
 select * into action from public.live_automation_actions where id=new.automation_action_id;
 if action.id is null or action.actor_id<>new.automation_actor_id or action.status<>'claimed' then raise exception 'INVALID_CHAT_ACTION'; end if;
 perform public.live_automation_ai_admission(new.automation_actor_id,action.kind);
 if action.kind<>'reply' then
   update public.live_automation_actors set proactive_quiet_until=clock_timestamp()+make_interval(secs=>300+floor(random()*601)::int) where id=new.automation_actor_id;
 end if;
 return new;
end $$;
create trigger live_automation_sparse_chat_guard before insert on public.live_chat_messages
for each row execute function public.live_automation_sparse_chat_guard();

-- Amend the local, previously created definitions. Any drift fails the migration instead of weakening protection.
do $$
declare source text; original text; begin
 select pg_get_functiondef('public.live_automation_reconnect(uuid,integer,boolean)'::regprocedure) into original;
 source:=replace(original,'p_minutes not in(5,10,30,60,120)','p_minutes not between 5 and 120');
 if source=original then raise exception 'DWELL_PATCH_FAILED'; end if; execute source;

 select pg_get_functiondef('public.live_automation_control(uuid,text,boolean,bigint)'::regprocedure) into original;
 source:=replace(original,'clock_timestamp()+interval ''5 minutes''+random()*interval ''270 seconds''','clock_timestamp()');
 source:=replace(source,'return to_jsonb(c);',
 'if p_enabled and p_feature in (''orders'',''all'') then perform public.live_automation_plan_tempo(c.id,false); select * into c from public.live_automation_campaigns where id=c.id; end if; return to_jsonb(c);');
 if source=original or position('interval ''5 minutes''' in source)>0 then raise exception 'CONTROL_TEMPO_PATCH_FAILED'; end if; execute source;

 select pg_get_functiondef('public.live_automation_submit(uuid,uuid,bigint,jsonb)'::regprocedure) into original;
 source:=replace(original,
 'if not a.manual and c.last_submitted_at is not null and t<c.last_submitted_at+interval ''5 minutes'' then raise exception ''ORDER_TOO_EARLY''; end if;',
 'if not a.manual then perform public.live_automation_order_admission(c.id,a.id); end if;');
 source:=replace(source,'case when orders_enabled then t+interval ''5 minutes''+random()*interval ''270 seconds'' else null end','next_order_at');
 source:=replace(source,'return v_result;','perform public.live_automation_after_submit(c.id); return v_result;');
 if source=original or position('ORDER_TOO_EARLY' in source)>0 then raise exception 'SUBMIT_TEMPO_PATCH_FAILED'; end if; execute source;
end $$;
do $$
declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'live_automation_%' loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
