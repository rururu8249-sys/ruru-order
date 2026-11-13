-- Private nickname claims; every mutation is authorized by the server route.
-- A shared short identity lock orders customer-name changes, AI commits and operator claims.
create or replace function public.live_automation_name_key(p_name text) returns text
language sql immutable parallel safe set search_path=pg_catalog as $$
 select lower(regexp_replace(normalize(coalesce(p_name,''),NFC),'[[:space:]]','','g'));
$$;
create index if not exists customers_automation_name_key on public.customers(public.live_automation_name_key(youtube_nickname));
alter table public.live_automation_actors add column retired_at timestamptz;
alter table public.live_automation_actors add column ai_quiet_until timestamptz;
create table public.live_automation_nickname_pool (
 nickname_key text primary key, nickname text not null, category text not null,
 status text not null default 'unused' check(status in('unused','assigned','retired')),
 actor_id uuid references public.live_automation_actors(id), updated_at timestamptz not null default now()
);
create table public.live_automation_manual_leases (
 actor_id uuid primary key references public.live_automation_actors(id),
 campaign_id uuid not null references public.live_automation_campaigns(id),
 operator_key text not null, client_id uuid not null, token uuid not null unique default gen_random_uuid(),
 expires_at timestamptz not null, updated_at timestamptz not null default now()
);
create index live_automation_manual_operator on public.live_automation_manual_leases(operator_key,client_id);
create table public.live_automation_manual_messages (
 request_id uuid primary key, actor_id uuid not null references public.live_automation_actors(id),
 operator_key text not null, client_id uuid not null, lease_token uuid not null, body text not null,
 message_id bigint unique references public.live_chat_messages(id), created_at timestamptz not null default now()
);
alter table public.live_chat_messages add column automation_manual_request_id uuid;
create unique index live_chat_manual_request on public.live_chat_messages(automation_manual_request_id) where automation_manual_request_id is not null;

create or replace function public.live_automation_identity_lock() returns void language sql set search_path=pg_catalog as $$
 select pg_advisory_xact_lock(hashtextextended('live-automation-identities',0));
$$;
create or replace function public.live_automation_notify(p_broadcast uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Only an invalidation signal is public; names, owners, tokens and activity stay in protected HTTP reads.
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
   execute 'select realtime.send($1,$2,$3,false)' using jsonb_build_object('changed',true),'changed','live-automation:'||p_broadcast::text;
 end if;
end $$;

create or replace function public.live_automation_eligibility(p_actor uuid) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare a public.live_automation_actors; c public.live_automation_campaigns;
 watching boolean:=false; cart boolean:=false; submitted integer:=0; today timestamptz;
begin
 select * into a from public.live_automation_actors where id=p_actor;
 select * into c from public.live_automation_campaigns where id=a.campaign_id;
 if a.id is null or a.retired_at is not null or not exists(select 1 from public.broadcasts where id=c.broadcast_id and status='ON' and is_deleted is not true)
 or exists(select 1 from public.customers where public.live_automation_name_key(youtube_nickname)=public.live_automation_name_key(a.nickname)) then
   return jsonb_build_object('manual',false,'ai',false,'present',false,'cart',false,'orders',0);
 end if;
 today:=date_trunc('day',clock_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 select exists(select 1 from public.live_automation_sessions s join public.visitor_presence v on v.automation_session_id=s.id
   where s.actor_id=a.id and s.campaign_id=c.id and s.watching and s.stopped_at is null and s.leave_at>clock_timestamp()
   and s.last_ack_at>clock_timestamp()-interval '75 seconds' and v.last_seen_at>clock_timestamp()-interval '75 seconds') into watching;
 select exists(select 1 from public.live_automation_cart_holds h join public.live_automation_sessions s on s.id=h.session_id
   where s.actor_id=a.id and s.campaign_id=c.id and s.stopped_at is null and s.leave_at>clock_timestamp()
   and h.expires_at>clock_timestamp() and jsonb_array_length(h.items)>0) into cart;
 select count(distinct o.order_group_id)::int into submitted from public.orders o
   where o.automation_actor_id=a.id and (to_jsonb(o)->>'is_deleted')::boolean is not true and o.created_at>=today and o.created_at<today+interval '1 day';
 return jsonb_build_object('manual',watching or cart or submitted>0,'ai',cart or submitted>0,
   'present',watching,'cart',cart,'orders',submitted);
end $$;

create or replace function public.live_automation_pool_refill(p_candidates jsonb) returns integer
language plpgsql set search_path=pg_catalog,public as $$
declare item jsonb; k text; n integer:=0; begin
 perform public.live_automation_identity_lock();
 if jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>300 then raise exception 'INVALID_POOL'; end if;
 for item in select value from jsonb_array_elements(p_candidates) loop
   if (select count(*) from public.live_automation_nickname_pool where status='unused')>=200 then exit; end if;
   k:=public.live_automation_name_key(item->>'nickname');
   if length(k) not between 2 and 20 or k~*'(test|admin|official)' then continue; end if;
   if exists(select 1 from public.customers where public.live_automation_name_key(youtube_nickname)=k)
     or exists(select 1 from public.live_automation_actors where public.live_automation_name_key(nickname)=k) then continue; end if;
   insert into public.live_automation_nickname_pool(nickname_key,nickname,category)
     values(k,trim(item->>'nickname'),coalesce(item->>'category','korean')) on conflict do nothing;
   if found then n:=n+1; end if;
 end loop;
 return n;
end $$;

create or replace function public.live_automation_pool_assign(p_broadcast uuid,p_profile jsonb,p_target integer,p_minutes integer,p_watch boolean) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare candidate public.live_automation_nickname_pool; result jsonb; begin
 perform public.live_automation_identity_lock();
 select * into candidate from public.live_automation_nickname_pool n where status='unused'
   and not exists(select 1 from public.customers c where public.live_automation_name_key(c.youtube_nickname)=n.nickname_key)
   order by random() for update skip locked limit 1;
 if candidate.nickname_key is null then raise exception 'NICKNAME_POOL_EMPTY'; end if;
 result:=public.live_automation_actor(p_broadcast,candidate.nickname,p_profile,p_target,p_minutes,p_watch);
 update public.live_automation_nickname_pool set status='assigned',actor_id=(result->'actor'->>'id')::uuid,updated_at=clock_timestamp()
   where nickname_key=candidate.nickname_key;
 return result;
end $$;

create or replace function public.live_automation_manual_list(p_broadcast uuid,p_operator text,p_client uuid) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'nickname',a.nickname,'activity',e.value,
   'inUse',coalesce(l.expires_at>clock_timestamp(),false),'mine',coalesce(l.expires_at>clock_timestamp() and l.operator_key=p_operator and l.client_id=p_client,false),
   'expiresAt',case when l.expires_at>clock_timestamp() then l.expires_at end) order by a.nickname),'[]'::jsonb)
 from public.live_automation_actors a join public.live_automation_campaigns c on c.id=a.campaign_id
 cross join lateral (select public.live_automation_eligibility(a.id) as value) e
 left join public.live_automation_manual_leases l on l.actor_id=a.id
 where c.broadcast_id=p_broadcast and (e.value->>'manual')::boolean;
$$;

create or replace function public.live_automation_manual_select(p_broadcast uuid,p_actor uuid,p_operator text,p_client uuid) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; l public.live_automation_manual_leases; until_at timestamptz; begin
 perform public.live_automation_identity_lock();
 select x.* into c from public.live_automation_campaigns x join public.live_automation_actors a on a.campaign_id=x.id
 where a.id=p_actor and x.broadcast_id=p_broadcast for update of x;
 if c.id is null or length(coalesce(p_operator,''))<3 or p_client is null or not (public.live_automation_eligibility(p_actor)->>'manual')::boolean then raise exception 'NOT_ELIGIBLE'; end if;
 select * into l from public.live_automation_manual_leases where actor_id=p_actor for update;
 if l.expires_at>clock_timestamp() then
   if l.operator_key<>p_operator or l.client_id<>p_client then raise exception 'NICKNAME_IN_USE'; end if;
   return to_jsonb(l);
 end if;
 until_at:=clock_timestamp()+interval '90 seconds';
 -- Successful switch first proves the destination is available; failed switches keep the old claim.
 update public.live_automation_actors set ai_quiet_until=clock_timestamp()+interval '5 minutes'
 where id in(select actor_id from public.live_automation_manual_leases where operator_key=p_operator and client_id=p_client and campaign_id=c.id);
 update public.live_automation_manual_leases set expires_at=clock_timestamp(),updated_at=clock_timestamp()
 where operator_key=p_operator and client_id=p_client and campaign_id=c.id;
 insert into public.live_automation_manual_leases(actor_id,campaign_id,operator_key,client_id,expires_at)
 values(p_actor,c.id,p_operator,p_client,until_at)
 on conflict(actor_id) do update set operator_key=excluded.operator_key,client_id=excluded.client_id,
 token=gen_random_uuid(),expires_at=excluded.expires_at,updated_at=clock_timestamp() returning * into l;
 update public.live_automation_actors set ai_quiet_until=until_at+interval '5 minutes' where id=p_actor;
 update public.live_automation_actions set status='cancelled',completed_at=clock_timestamp(),lease_token=null
 where actor_id=p_actor and kind in('chat','question','reply') and status in('pending','claimed','uncertain');
 perform public.live_automation_notify(p_broadcast);
 return to_jsonb(l);
end $$;

create or replace function public.live_automation_manual_renew(p_token uuid,p_operator text,p_client uuid) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare l public.live_automation_manual_leases; begin
 perform public.live_automation_identity_lock();
 select * into l from public.live_automation_manual_leases where token=p_token for update;
 if l.actor_id is null or l.operator_key<>p_operator or l.client_id<>p_client or l.expires_at<=clock_timestamp()
 or not (public.live_automation_eligibility(l.actor_id)->>'manual')::boolean then raise exception 'LEASE_LOST'; end if;
 update public.live_automation_manual_leases set expires_at=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp() where actor_id=l.actor_id returning * into l;
 update public.live_automation_actors set ai_quiet_until=l.expires_at+interval '5 minutes' where id=l.actor_id;
 return to_jsonb(l);
end $$;
create or replace function public.live_automation_manual_release(p_token uuid,p_operator text,p_client uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare l public.live_automation_manual_leases; bc uuid; begin
 perform public.live_automation_identity_lock();
 update public.live_automation_manual_leases set expires_at=clock_timestamp(),updated_at=clock_timestamp()
 where token=p_token and operator_key=p_operator and client_id=p_client returning * into l;
 if not found then return; end if;
 update public.live_automation_actors set ai_quiet_until=clock_timestamp()+interval '5 minutes' where id=l.actor_id;
 select broadcast_id into bc from public.live_automation_campaigns where id=l.campaign_id;
 perform public.live_automation_notify(bc);
end $$;

create or replace function public.live_automation_assert_ai(p_actor uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
begin
 perform public.live_automation_identity_lock();
 if not (public.live_automation_eligibility(p_actor)->>'ai')::boolean then raise exception 'AI_NOT_ELIGIBLE'; end if;
 if exists(select 1 from public.live_automation_manual_leases where actor_id=p_actor and expires_at>clock_timestamp())
 or exists(select 1 from public.live_automation_actors where id=p_actor and ai_quiet_until>clock_timestamp()) then raise exception 'MANUAL_CHAT_ACTIVE'; end if;
end $$;

create or replace function public.live_automation_manual_send(p_broadcast uuid,p_token uuid,p_operator text,p_client uuid,p_request uuid,p_body text) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare l public.live_automation_manual_leases; a public.live_automation_actors; prior public.live_automation_manual_messages; msg public.live_chat_messages; begin
 perform public.live_automation_identity_lock();
 if length(trim(p_body)) not between 1 and 500 or left(trim(p_body),1)='/' or p_request is null then raise exception 'INVALID_CHAT'; end if;
 select * into l from public.live_automation_manual_leases where token=p_token for update;
 if l.actor_id is null or l.operator_key<>p_operator or l.client_id<>p_client or l.expires_at<=clock_timestamp()
 or not exists(select 1 from public.live_automation_campaigns where id=l.campaign_id and broadcast_id=p_broadcast)
 or not (public.live_automation_eligibility(l.actor_id)->>'manual')::boolean then raise exception 'LEASE_LOST'; end if;
 select * into prior from public.live_automation_manual_messages where request_id=p_request;
 if prior.request_id is not null then
   if prior.operator_key<>p_operator or prior.client_id<>p_client or prior.actor_id<>l.actor_id or prior.body<>trim(p_body) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   select * into msg from public.live_chat_messages where id=prior.message_id;
   if msg.id is null then raise exception 'MESSAGE_REMOVED'; end if;
   return to_jsonb(msg);
 end if;
 if exists(select 1 from public.live_automation_manual_messages where operator_key=p_operator and created_at>clock_timestamp()-interval '1 second')
 then raise exception 'CHAT_TOO_FAST'; end if;
 select * into a from public.live_automation_actors where id=l.actor_id;
 insert into public.live_automation_manual_messages(request_id,actor_id,operator_key,client_id,lease_token,body)
 values(p_request,a.id,p_operator,p_client,p_token,trim(p_body));
 perform set_config('ruru.live_automation_manual',p_request::text,true);
 insert into public.live_chat_messages(broadcast_id,kakao_id,customer_id,nickname,body,automation_actor_id,automation_manual_request_id)
 values(p_broadcast,'990000000077',a.customer_id,a.nickname,trim(p_body),a.id,p_request) returning * into msg;
 perform set_config('ruru.live_automation_manual','',true);
 update public.live_automation_manual_messages set message_id=msg.id where request_id=p_request;
 return to_jsonb(msg);
end $$;

create or replace function public.live_automation_chat_identity_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.automation_actor_id is null then return new; end if;
 perform public.live_automation_identity_lock();
 if new.automation_manual_request_id is not null then
   if current_setting('ruru.live_automation_manual',true) is distinct from new.automation_manual_request_id::text
   or not exists(select 1 from public.live_automation_manual_messages where request_id=new.automation_manual_request_id and actor_id=new.automation_actor_id)
   then raise exception 'MANUAL_AUTH_REQUIRED'; end if;
 else
   perform public.live_automation_assert_ai(new.automation_actor_id);
 end if;
 return new;
end $$;
create trigger live_automation_chat_identity_guard before insert on public.live_chat_messages
for each row execute function public.live_automation_chat_identity_guard();

create or replace function public.live_automation_member_name_changed() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text; a record; begin
 if tg_op='UPDATE' and new.youtube_nickname is not distinct from old.youtube_nickname then return new; end if;
 perform public.live_automation_identity_lock();
 k:=public.live_automation_name_key(new.youtube_nickname);
 update public.live_automation_nickname_pool set status='retired',updated_at=clock_timestamp() where nickname_key=k;
 for a in select x.id,c.broadcast_id from public.live_automation_actors x join public.live_automation_campaigns c on c.id=x.campaign_id
 where public.live_automation_name_key(x.nickname)=k and x.retired_at is null loop
   update public.live_automation_actors set retired_at=clock_timestamp() where id=a.id;
   update public.live_automation_sessions set stopped_at=clock_timestamp(),watching=false where actor_id=a.id and stopped_at is null;
   delete from public.visitor_presence where automation_session_id in(select id from public.live_automation_sessions where actor_id=a.id);
   delete from public.live_automation_cart_holds where session_id in(select id from public.live_automation_sessions where actor_id=a.id);
   update public.live_automation_actions set status='cancelled',lease_token=null,completed_at=clock_timestamp() where actor_id=a.id and status in('pending','claimed','uncertain');
   update public.live_automation_manual_leases set expires_at=clock_timestamp() where actor_id=a.id;
   update public.live_chat_messages set hidden_at=clock_timestamp(),hidden_by='automation-name-collision' where automation_actor_id=a.id and hidden_at is null;
   perform public.live_automation_notify(a.broadcast_id);
 end loop;
 return new;
end $$;
create trigger live_automation_member_name_changed before insert or update of youtube_nickname on public.customers
for each row execute function public.live_automation_member_name_changed();

-- Serialize all pre-existing automation mutations before any campaign/action row locks.
do $$
declare f record; source text; begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in(
 'live_automation_control','live_automation_reconnect','live_automation_actor','live_automation_context','live_automation_action',
 'live_automation_claim','live_automation_assert_claim','live_automation_complete','live_automation_presence','live_automation_cart',
 'live_automation_submit','live_automation_chat') loop
   source:=pg_get_functiondef(f.oid);
   source:=regexp_replace(source,'\mbegin\M','begin PERFORM public.live_automation_identity_lock();','i');
   if source=pg_get_functiondef(f.oid) then raise exception 'IDENTITY_LOCK_PATCH_FAILED'; end if;
   execute source;
 end loop;
end $$;

-- Future actor allocations use the same normalization as indexed customer lookup.
create or replace function public.live_automation_actor_name_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 perform public.live_automation_identity_lock();
 new.nickname_key:=public.live_automation_name_key(new.nickname);
 if exists(select 1 from public.customers where public.live_automation_name_key(youtube_nickname)=new.nickname_key)
 or exists(select 1 from public.live_automation_actors where public.live_automation_name_key(nickname)=new.nickname_key and retired_at is null)
 then raise exception 'NICKNAME_UNAVAILABLE'; end if;
 return new;
end $$;
create trigger live_automation_actor_name_guard before insert on public.live_automation_actors
for each row execute function public.live_automation_actor_name_guard();

do $$
declare t text; f record; begin
 foreach t in array array['live_automation_nickname_pool','live_automation_manual_leases','live_automation_manual_messages'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'live_automation_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
