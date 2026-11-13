-- Applied only after reviewing the core migration and production RPC fingerprint.
create extension if not exists pg_net with schema extensions;
create schema if not exists live_automation_private;
revoke all on schema live_automation_private from public,anon,authenticated;
create table live_automation_private.runtime (
  singleton boolean primary key default true check(singleton), origin text not null,
  secret_id uuid not null, secret_hash text not null
);
revoke all on live_automation_private.runtime from public,anon,authenticated,service_role;

create or replace function public.live_automation_runtime_ready() returns boolean
language sql security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from live_automation_private.runtime) and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null;
$$;
create or replace function public.live_automation_configure(p_origin text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare token text; secret_id uuid; begin
  if p_origin !~ '^https://[a-zA-Z0-9.-]+(:443)?$' then raise exception 'INVALID_ORIGIN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('live-automation-control',0));
  if exists(select 1 from public.live_automation_campaigns where orders_enabled or chat_enabled or viewers_enabled) then raise exception 'STOP_BEFORE_CONFIGURE'; end if;
  if exists(select 1 from live_automation_private.runtime) then
    update live_automation_private.runtime set origin=p_origin;
    return;
  end if;
  token:=gen_random_uuid()::text||gen_random_uuid()::text;
  select vault.create_secret(token,'live_automation_dispatch','Server-only automation dispatcher') into secret_id;
  insert into live_automation_private.runtime values(true,p_origin,secret_id,encode(sha256(convert_to(token,'UTF8')),'hex'));
end $$;

create or replace function public.live_automation_authorize_tick(p_hash text) returns boolean
language sql security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from live_automation_private.runtime where secret_hash=p_hash);
$$;

create or replace function public.live_automation_dispatch() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare origin text; token text; begin
  select r.origin,v.decrypted_secret into origin,token from live_automation_private.runtime r join vault.decrypted_secrets v on v.id=r.secret_id;
  if origin is null or token is null then return; end if;
  if exists(select 1 from public.live_automation_campaigns where viewers_enabled) then
    perform net.http_post(url=>origin||'/api/cron/auto-test-order',body=>'{"kind":"presence"}'::jsonb,
      headers=>jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds=>20000);
  end if;
  if exists(select 1 from public.live_automation_campaigns where (orders_enabled and next_order_at<=clock_timestamp()+interval '120 seconds')
      or (chat_enabled and (updated_at<=clock_timestamp()-interval '3 minutes')))
    or exists(select 1 from public.live_automation_actions a join public.live_automation_campaigns c on c.id=a.campaign_id
      where a.status in('pending','claimed') and a.due_at<=clock_timestamp() and (c.orders_enabled or c.chat_enabled or a.manual)) then
    perform net.http_post(url=>origin||'/api/cron/auto-test-order',body=>'{"kind":"actions"}'::jsonb,
      headers=>jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),timeout_milliseconds=>55000);
  end if;
end $$;

create or replace function public.live_automation_schedule(p_enabled boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare job bigint; begin
  if p_enabled then
    if not public.live_automation_runtime_ready() then raise exception 'AUTOMATION_SCHEDULER_NOT_READY'; end if;
    perform cron.schedule('live-automation-v2','30 seconds','select public.live_automation_dispatch()');
  else
    select jobid into job from cron.job where jobname='live-automation-v2';
    if job is not null then perform cron.unschedule(job); end if;
  end if;
end $$;

-- The shared RPC still performs option/stock validation. Only its mutation is skipped for
-- an order bound to the currently claimed, authenticated automation action.
do $$ declare body text; marker text:='IF v_matched THEN'; begin
  select pg_get_functiondef('public.submit_customer_order_with_points(jsonb,integer,text,text,text,text)'::regprocedure) into body;
  if length(body)-length(replace(body,marker,''))<>length(marker) then raise exception 'ORDER_RPC_CHANGED_REVIEW_REQUIRED'; end if;
  body:=replace(body,marker,'IF v_matched AND NOT public.live_automation_verified_order(p_order_rows->0->>''order_group_id'') THEN');
  execute body;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'live_automation_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.sig);
    execute format('grant execute on function %s to service_role',f.sig);
  end loop;
end $$;
-- Intentionally no configure(), schedule() or ON call during migration. Deployment starts OFF.
