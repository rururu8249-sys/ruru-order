-- Server-owned rehearsal population. All counts still come from real visitor_presence rows.
alter table public.live_automation_campaigns drop constraint live_automation_campaigns_max_active_check;
alter table public.live_automation_campaigns add constraint live_automation_campaigns_max_active_check check(max_active between 1 and 100);
alter table public.live_automation_campaigns alter column max_active set default 100;
update public.live_automation_campaigns set max_active=100;
alter table public.live_automation_campaigns add column population_plan jsonb;

create or replace function public.live_automation_population_step(p_campaign uuid,p_revision bigint,p_profiles jsonb) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; plan jsonb; t timestamptz:=clock_timestamp(); target integer; n integer; remove_n integer;
 s record; allocated jsonb; anchor uuid; i integer; minutes integer; begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 if c.id is null or c.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
 if not c.viewers_enabled then raise exception 'VIEWERS_OFF'; end if;
 if not exists(select 1 from public.broadcasts where id=c.broadcast_id and status='ON' and is_deleted is not true) then raise exception 'BROADCAST_ENDED'; end if;
 if jsonb_typeof(p_profiles)<>'array' or jsonb_array_length(p_profiles)<>12 then raise exception 'INVALID_PROFILES'; end if;
 perform public.live_automation_expire(c.id);
 -- Lost heartbeat => new session identity, never resurrect the old presence row.
 for s in select actor_id from public.live_automation_sessions where campaign_id=c.id and watching and stopped_at is null and leave_at>t and last_ack_at<t-interval '75 seconds' loop
   perform public.live_automation_reconnect(s.actor_id,30,true);
 end loop;
 plan:=c.population_plan;
 if plan is null then
   plan:=jsonb_build_object('phase','baseline','target',50,'until',t+interval '2 minutes','nextSpike',t+make_interval(secs=>900+floor(random()*901)::int));
 elsif (plan->>'until')::timestamptz<=t then
   if plan->>'phase'<>'spike' and (plan->>'nextSpike')::timestamptz<=t then
     plan:=jsonb_build_object('phase','spike','target',90+floor(random()*11)::int,'until',t+make_interval(secs=>120+floor(random()*61)::int),'nextSpike',t+make_interval(secs=>2700+floor(random()*2701)::int));
   else
     plan:=plan||jsonb_build_object('phase','baseline','target',42+floor(random()*17)::int,'until',t+make_interval(secs=>120+floor(random()*181)::int));
   end if;
 end if;
 target:=least(c.max_active,greatest(1,(plan->>'target')::int));
 select count(*)::int into n from public.live_automation_sessions where campaign_id=c.id and watching and stopped_at is null and leave_at>t;
 if n>target then
   remove_n:=least(8,n-target);
   -- Watching can end while an order/session remains valid. Do not interrupt manual ownership or pending carts/orders.
   for s in select x.id from public.live_automation_sessions x where x.campaign_id=c.id and x.watching and x.stopped_at is null and x.leave_at>t
     and not exists(select 1 from public.live_automation_manual_leases l where l.actor_id=x.actor_id and l.expires_at>t)
     and not exists(select 1 from public.live_automation_actions a where a.session_id=x.id and a.status in('pending','claimed','uncertain'))
     order by random() limit remove_n loop
     update public.live_automation_sessions set watching=false where id=s.id;
     delete from public.visitor_presence where automation_session_id=s.id;
     n:=n-1;
   end loop;
 elsif n<target then
   for i in 1..least(15,target-n) loop
     minutes:=case when random()<.65 then 5+floor(random()*26)::int else 31+floor(random()*90)::int end;
     allocated:=public.live_automation_pool_assign(c.broadcast_id,p_profiles->floor(random()*12)::int,case when c.orders_enabled then 1+floor(random()*3)::int else 0 end,minutes,true);
     n:=n+1;
   end loop;
 end if;
 update public.live_automation_campaigns set population_plan=plan where id=c.id;
 select id into anchor from public.live_automation_sessions where campaign_id=c.id and watching and stopped_at is null and leave_at>clock_timestamp() order by leave_at desc limit 1;
 return jsonb_build_object('count',n,'target',target,'phase',plan->>'phase','anchor',anchor);
end $$;

create or replace function public.live_automation_presence_batch(p_session uuid,p_revision bigint,p_path text) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare ctx jsonb; campaign uuid; t timestamptz:=clock_timestamp(); n integer; begin
 perform public.live_automation_identity_lock();
 ctx:=public.live_automation_context(p_session,p_revision,'presence'); campaign:=(ctx->'campaign'->>'id')::uuid;
 if p_path<>'/order#live' then raise exception 'INVALID_WATCH_PATH'; end if;
 insert into public.visitor_presence(visitor_key,nickname,page_type,path,last_seen_at,updated_at,kakao_id,automation_session_id,automation_leave_at)
 select s.visitor_key,a.nickname,'order_form',p_path,t,t,'990000000077',s.id,s.leave_at
 from public.live_automation_sessions s join public.live_automation_actors a on a.id=s.actor_id
 where s.campaign_id=campaign and s.watching and s.stopped_at is null and s.leave_at>t and a.retired_at is null
   and (s.last_ack_at is null or s.last_ack_at>=t-interval '75 seconds')
 on conflict(visitor_key) do update set nickname=excluded.nickname,page_type=excluded.page_type,path=excluded.path,last_seen_at=t,updated_at=t,automation_session_id=excluded.automation_session_id,automation_leave_at=excluded.automation_leave_at;
 get diagnostics n=row_count;
 update public.live_automation_sessions set last_ack_at=t where campaign_id=campaign and watching and stopped_at is null and leave_at>t and (last_ack_at is null or last_ack_at>=t-interval '75 seconds');
 return jsonb_build_object('ok',true,'lastSeenAt',t,'count',n);
end $$;

-- Independent simulated receipt events: no actual payment/order/point/shipping state is updated.
create table public.live_automation_payment_events (
 order_action_id uuid primary key references public.live_automation_actions(id) on delete cascade,
 campaign_id uuid not null references public.live_automation_campaigns(id) on delete cascade,
 run_id uuid not null, actor_id uuid not null, session_id uuid not null, nickname text not null,
 kind text not null check(kind in('bank','card')), due_at timestamptz not null,
 status text not null default 'pending' check(status in('pending','sent','cancelled','skipped')),
 created_at timestamptz not null default now(), sent_at timestamptz, message_id bigint
);
alter table public.live_automation_payment_events enable row level security;
revoke all on public.live_automation_payment_events from public,anon,authenticated;
grant all on public.live_automation_payment_events to service_role;
create index live_automation_payment_due on public.live_automation_payment_events(campaign_id,due_at) where status='pending';
alter table public.live_chat_messages add column automation_payment_action_id uuid;
create unique index live_automation_payment_message_once on public.live_chat_messages(automation_payment_action_id) where automation_payment_action_id is not null;

create or replace function public.live_automation_queue_payment() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; nick text; method text; begin
 if new.kind<>'order' or new.status<>'succeeded' or old.status='succeeded' then return new; end if;
 select * into c from public.live_automation_campaigns where id=new.campaign_id;
 if not c.orders_enabled then return new; end if;
 select o.youtube_nickname,to_jsonb(o)->>'payment_method' into nick,method from public.orders o
 where o.automation_action_id=new.id and o.is_test_order and o.exclude_from_payment_match and o.exclude_from_settlement and o.exclude_from_shipping and o.exclude_from_picking limit 1;
 if nick is null then return new; end if;
 insert into public.live_automation_payment_events(order_action_id,campaign_id,run_id,actor_id,session_id,nickname,kind,due_at,status)
 values(new.id,c.id,c.run_id,new.actor_id,new.session_id,nick,case when method='카드결제' then 'card' else 'bank' end,
 clock_timestamp()+make_interval(secs=>45+floor(random()*376)::int),case when random()<.8 then 'pending' else 'skipped' end) on conflict do nothing;
 return new;
end $$;
create trigger live_automation_queue_payment after update of status on public.live_automation_actions for each row execute function public.live_automation_queue_payment();

create or replace function public.live_automation_payment_notice_valid(p_action uuid,p_actor uuid,p_session uuid,p_broadcast uuid,p_body text,p_ref text) returns boolean
language sql stable set search_path=pg_catalog,public as $$
 select coalesce(p_action is not null and p_action::text=nullif(current_setting('ruru.live_automation_payment',true),'') and exists(
 select 1 from public.live_automation_payment_events e join public.live_automation_campaigns c on c.id=e.campaign_id
 join public.broadcasts b on b.id=c.broadcast_id join public.live_automation_actors a on a.id=e.actor_id
 where e.order_action_id=p_action and e.actor_id=p_actor and e.session_id=p_session and c.broadcast_id=p_broadcast
 and e.run_id=c.run_id and e.status='pending' and c.orders_enabled and b.status='ON' and b.is_deleted is not true and a.retired_at is null
 and p_ref='ap:'||e.order_action_id and p_body='💗 '||e.nickname||case when e.kind='card' then '님 카드결제 확인! 감사합니다' else '님 입금 확인! 감사합니다' end
 and exists(select 1 from public.orders o where o.automation_action_id=e.order_action_id and o.is_test_order and o.exclude_from_payment_match and o.exclude_from_settlement and o.exclude_from_shipping and o.exclude_from_picking and (to_jsonb(o)->>'is_deleted')::boolean is not true)),false);
$$;
create or replace function public.live_automation_payment_chat_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$ begin
 if new.automation_payment_action_id is not null and (new.kakao_id is distinct from 'bot:ruru' or new.badge is distinct from 'bot' or not public.live_automation_payment_notice_valid(new.automation_payment_action_id,new.automation_actor_id,new.automation_session_id,new.broadcast_id,new.body,new.bot_ref)) then raise exception 'PAYMENT_NOTICE_UNAUTHORIZED'; end if;
 return new;
end $$;
create trigger live_automation_payment_chat_guard before insert on public.live_chat_messages for each row execute function public.live_automation_payment_chat_guard();
-- Official receipt messages bypass persona AI pacing only after validating the isolated event.
do $$ declare sig text; original text; source text; begin
 foreach sig in array array['public.live_automation_chat_identity_guard()','public.live_automation_sparse_chat_guard()'] loop
 select pg_get_functiondef(sig::regprocedure) into original;
 source:=regexp_replace(original,'begin','begin
 if new.automation_payment_action_id is not null and new.kakao_id=''bot:ruru'' and new.badge=''bot'' and public.live_automation_payment_notice_valid(new.automation_payment_action_id,new.automation_actor_id,new.automation_session_id,new.broadcast_id,new.body,new.bot_ref) then return new; end if;', 'i');
 if source=original then raise exception 'PAYMENT_GUARD_PATCH_FAILED'; end if; execute source;
 end loop;
end $$;

create or replace function public.live_automation_drain_payments(p_campaign uuid,p_revision bigint) returns integer
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; e public.live_automation_payment_events; msg bigint; body text; n integer:=0; begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 if c.id is null or c.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
 if not c.orders_enabled or not exists(select 1 from public.broadcasts where id=c.broadcast_id and status='ON' and is_deleted is not true) then return 0; end if;
 for e in select * from public.live_automation_payment_events where campaign_id=c.id and status='pending' and due_at<=clock_timestamp() order by due_at limit 3 for update loop
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

create or replace function public.live_automation_crowd_stop() returns trigger
language plpgsql set search_path=pg_catalog,public as $$ begin
 if not new.orders_enabled then update public.live_automation_payment_events set status='cancelled' where campaign_id=new.id and status='pending'; end if;
 if not new.viewers_enabled then new.population_plan:=null; end if;
 return new;
end $$;
create trigger live_automation_crowd_stop before update of orders_enabled,viewers_enabled on public.live_automation_campaigns for each row execute function public.live_automation_crowd_stop();

-- Every wave is saved once. A busy audience favors a short order burst, then quiet.
create or replace function public.live_automation_plan_tempo(p_campaign uuid,p_quiet boolean default false) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; mode text; pick double precision:=random(); delay integer; offsets jsonb; plan jsonb; begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 if c.id is null then raise exception 'NO_CAMPAIGN'; end if;
 if not c.orders_enabled then update public.live_automation_campaigns set next_order_at=null,tempo_plan=null where id=c.id; return null; end if;
 mode:=case when not p_quiet and c.tempo_plan is null then 'startup'
 when p_quiet or c.tempo_plan->>'mode'='burst' then 'quiet'
 when c.population_plan->>'phase'='spike' then 'burst'
 when pick<.25 then 'quiet' when pick<.85 then 'steady' else 'burst' end;
 delay:=case mode when 'startup' then 45+floor(random()*46)::int when 'quiet' then 180+floor(random()*301)::int when 'steady' then 35+floor(random()*66)::int else 15+floor(random()*21)::int end;
 if mode='burst' then
   select jsonb_agg(offset_ms order by offset_ms) into offsets from (select floor(random()*90001)::int offset_ms from generate_series(1,4+floor(random()*5)::int)) x;
 elsif mode='steady' then
   select jsonb_agg(offset_ms order by offset_ms) into offsets from (select floor(random()*45001)::int offset_ms from generate_series(1,1+floor(random()*2)::int)) x;
 else offsets:='[0]'::jsonb; end if;
 plan:=jsonb_build_object('id',gen_random_uuid(),'mode',mode,'at',clock_timestamp()+make_interval(secs=>delay),'offsets',offsets,'revision',c.revision);
 update public.live_automation_campaigns set tempo_plan=plan,next_order_at=(plan->>'at')::timestamptz where id=c.id; return plan;
end $$;
do $$ declare original text; source text; begin
 select pg_get_functiondef('public.live_automation_order_admission(uuid,uuid)'::regprocedure) into original;
 source:=replace(original,')>=20',')>=120');
 if source=original then raise exception 'ADMISSION_LIMIT_PATCH_DRIFT'; end if; execute source;
 -- Queue delivery remains scheduled even if AI chat is off and next order is far away.
 select pg_get_functiondef('public.live_automation_dispatch()'::regprocedure) into original;
 source:=replace(original,'if exists(select 1 from public.live_automation_campaigns where (orders_enabled',
 'if exists(select 1 from public.live_automation_payment_events e join public.live_automation_campaigns c on c.id=e.campaign_id where e.status=''pending'' and e.due_at<=clock_timestamp() and c.orders_enabled) or exists(select 1 from public.live_automation_campaigns where (orders_enabled');
 if source=original then raise exception 'DISPATCH_PAYMENT_PATCH_DRIFT'; end if; execute source;
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname like 'live_automation_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
