-- Conservative cost reservations, not provider billing. Service role only.
create table public.voice_budgets (
  broadcast_id uuid primary key references public.broadcasts(id),
  cap_krw integer not null default 40000 check (cap_krw between 1000 and 1000000),
  committed_krw integer not null default 0 check (committed_krw >= 0),
  enabled boolean not null default false,
  stop_reason text check (stop_reason in ('budget','manual','worker','error')),
  stopped_at timestamptz,
  warning_at timestamptz,
  worker_id uuid,
  worker_seen_at timestamptz,
  rate_version text,
  capture_phrase text not null default '상품 사진 저장' check (char_length(capture_phrase) between 4 and 40),
  updated_at timestamptz not null default now()
);
create table public.voice_reservations (
  broadcast_id uuid not null references public.voice_budgets(broadcast_id),
  request_id text not null check (char_length(request_id) between 1 and 160),
  kind text not null check (kind in ('server','transcription','context','capture')),
  amount_krw integer not null check (amount_krw between 1 and 1000000),
  created_at timestamptz not null default now(),
  primary key (broadcast_id,request_id)
);
create table public.voice_budget_events (
  id bigint generated always as identity primary key,
  broadcast_id uuid not null references public.voice_budgets(broadcast_id),
  kind text not null,
  cap_krw integer not null,
  committed_krw integer not null,
  created_at timestamptz not null default now()
);
create index voice_budget_events_broadcast_time on public.voice_budget_events(broadcast_id,created_at desc);
alter table public.voice_budgets enable row level security;
alter table public.voice_reservations enable row level security;
alter table public.voice_budget_events enable row level security;
revoke all on public.voice_budgets,public.voice_reservations,public.voice_budget_events from public,anon,authenticated;
grant select,insert,update on public.voice_budgets,public.voice_reservations,public.voice_budget_events to service_role;
grant usage,select on sequence public.voice_budget_events_id_seq to service_role;

create function public.voice_configure(p_broadcast uuid,p_action text,p_cap integer,p_phrase text)
returns public.voice_budgets language plpgsql security invoker set search_path='' as $$
declare b public.voice_budgets;
begin
  if p_action not in ('save','stop','resume') or p_action is null or p_cap is null or p_cap not between 1000 and 1000000
    or p_phrase is null or char_length(btrim(p_phrase)) not between 4 and 40 then raise exception 'invalid_configuration'; end if;
  insert into public.voice_budgets(broadcast_id) values(p_broadcast) on conflict do nothing;
  select * into b from public.voice_budgets where broadcast_id=p_broadcast for update;
  if p_action='stop' then p_cap:=b.cap_krw; p_phrase:=b.capture_phrase; end if;
  if p_cap < b.committed_krw then raise exception 'below_committed_budget'; end if;
  if p_action='resume' then
    if b.worker_seen_at is null or b.worker_seen_at < now()-interval '30 seconds' or b.rate_version is null then raise exception 'worker_not_ready'; end if;
    if not exists(select 1 from public.broadcasts where id=p_broadcast and status='ON' and not coalesce(is_deleted,false)) then raise exception 'broadcast_not_active'; end if;
    if p_cap <= b.committed_krw then raise exception 'budget_exhausted'; end if;
    b.enabled:=true; b.stop_reason:=null; b.stopped_at:=null;
  elsif p_action='stop' then
    b.enabled:=false; b.stop_reason:='manual'; b.stopped_at:=now();
  end if;
  if b.cap_krw <> p_cap then b.warning_at:=null; end if;
  if b.committed_krw::bigint*100 >= p_cap::bigint*80 then b.warning_at:=coalesce(b.warning_at,now()); end if;
  if b.committed_krw >= p_cap then b.enabled:=false; b.stop_reason:='budget'; b.stopped_at:=coalesce(b.stopped_at,now()); end if;
  update public.voice_budgets set cap_krw=p_cap,capture_phrase=btrim(p_phrase),enabled=b.enabled,
    stop_reason=b.stop_reason,stopped_at=b.stopped_at,warning_at=b.warning_at,updated_at=now()
    where broadcast_id=p_broadcast returning * into b;
  insert into public.voice_budget_events(broadcast_id,kind,cap_krw,committed_krw) values(p_broadcast,p_action,p_cap,b.committed_krw);
  return b;
end $$;

-- A trusted worker calls only after provider/relay/calibration readiness checks.
-- Lease takeover does not enable automation or reset amounts. Server allocation is charged once per broadcast.
create function public.voice_worker_claim(p_broadcast uuid,p_worker uuid,p_rate_version text,p_server_krw integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare b public.voice_budgets;
begin
  if p_worker is null or p_rate_version is null or char_length(p_rate_version) not between 1 and 100
    or p_server_krw is null or p_server_krw not between 1 and 1000000 then raise exception 'invalid_worker'; end if;
  select * into b from public.voice_budgets where broadcast_id=p_broadcast for update;
  if not found then raise exception 'budget_not_configured'; end if;
  if b.worker_id is not null and b.worker_id<>p_worker and b.worker_seen_at>now()-interval '30 seconds' then return false; end if;
  if b.rate_version is not null and b.rate_version<>p_rate_version then raise exception 'rate_policy_changed'; end if;
  if not exists(select 1 from public.voice_reservations where broadcast_id=p_broadcast and request_id='server-allocation') then
    if b.committed_krw+p_server_krw > b.cap_krw then raise exception 'budget_exhausted'; end if;
    insert into public.voice_reservations(broadcast_id,request_id,kind,amount_krw) values(p_broadcast,'server-allocation','server',p_server_krw);
    b.committed_krw:=b.committed_krw+p_server_krw;
  elsif not exists(select 1 from public.voice_reservations where broadcast_id=p_broadcast and request_id='server-allocation' and amount_krw=p_server_krw) then raise exception 'rate_policy_changed'; end if;
  if b.worker_id is distinct from p_worker or b.worker_seen_at < now()-interval '30 seconds' then
    b.enabled:=false; -- lease loss requires deliberate resume; no reconnect auto-start
  end if;
  update public.voice_budgets set worker_id=p_worker,worker_seen_at=now(),rate_version=p_rate_version,
    committed_krw=b.committed_krw,enabled=b.enabled,updated_at=now() where broadcast_id=p_broadcast;
  return true;
end $$;

create function public.voice_reserve(p_broadcast uuid,p_worker uuid,p_request text,p_kind text,p_amount integer,p_rate_version text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.voice_budgets; previous public.voice_reservations; why text;
begin
  if p_request is null or char_length(p_request) not between 1 and 160 or p_kind is null or p_kind not in ('transcription','context','capture')
    or p_amount is null or p_amount not between 1 and 1000000 then raise exception 'invalid_reservation'; end if;
  select * into b from public.voice_budgets where broadcast_id=p_broadcast for update;
  if not found then return jsonb_build_object('allowed',false,'reason','not_configured'); end if;
  if p_rate_version is null or b.rate_version is distinct from p_rate_version then return jsonb_build_object('allowed',false,'reason','rate_policy_changed'); end if;
  select * into previous from public.voice_reservations where broadcast_id=p_broadcast and request_id=p_request;
  if found then
    if previous.amount_krw<>p_amount or previous.kind<>p_kind then raise exception 'request_conflict'; end if;
    return jsonb_build_object('allowed',false,'reason','duplicate');
  end if;
  if not b.enabled then return jsonb_build_object('allowed',false,'reason',coalesce(b.stop_reason,'disabled')); end if;
  -- A stale, replaced worker cannot spend or stop a healthy worker's session.
  if b.worker_id is distinct from p_worker or p_worker is null then return jsonb_build_object('allowed',false,'reason','wrong_worker'); end if;
  if b.worker_seen_at is null or b.worker_seen_at < now()-interval '30 seconds' then why:='worker';
  elsif not exists(select 1 from public.broadcasts where id=p_broadcast and status='ON' and not coalesce(is_deleted,false)) then why:='worker';
  elsif b.committed_krw+p_amount>b.cap_krw then why:='budget'; end if;
  if why is not null then
    update public.voice_budgets set enabled=false,stop_reason=why,stopped_at=now(),updated_at=now() where broadcast_id=p_broadcast;
    insert into public.voice_budget_events(broadcast_id,kind,cap_krw,committed_krw) values(p_broadcast,'stopped_'||why,b.cap_krw,b.committed_krw);
    return jsonb_build_object('allowed',false,'reason',why);
  end if;
  insert into public.voice_reservations(broadcast_id,request_id,kind,amount_krw) values(p_broadcast,p_request,p_kind,p_amount);
  b.committed_krw:=b.committed_krw+p_amount;
  if b.warning_at is null and b.committed_krw::bigint*100>=b.cap_krw::bigint*80 then
    b.warning_at:=now();
    insert into public.voice_budget_events(broadcast_id,kind,cap_krw,committed_krw) values(p_broadcast,'warning',b.cap_krw,b.committed_krw);
  end if;
  if b.committed_krw=b.cap_krw then
    b.enabled:=false; b.stop_reason:='budget'; b.stopped_at:=now();
    insert into public.voice_budget_events(broadcast_id,kind,cap_krw,committed_krw) values(p_broadcast,'stopped_budget',b.cap_krw,b.committed_krw);
  end if;
  update public.voice_budgets set committed_krw=b.committed_krw,warning_at=b.warning_at,enabled=b.enabled,
    stop_reason=b.stop_reason,stopped_at=b.stopped_at,updated_at=now() where broadcast_id=p_broadcast;
  return jsonb_build_object('allowed',true,'committedKrw',b.committed_krw,'capKrw',b.cap_krw);
end $$;

revoke all on function public.voice_configure(uuid,text,integer,text),public.voice_worker_claim(uuid,uuid,text,integer),public.voice_reserve(uuid,uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.voice_configure(uuid,text,integer,text),public.voice_worker_claim(uuid,uuid,text,integer),public.voice_reserve(uuid,uuid,text,text,integer,text) to service_role;
