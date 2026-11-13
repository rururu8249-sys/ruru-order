-- Private automation state. Existing customer/order/presence endpoints remain the entry points.
create table public.live_automation_campaigns (
  id uuid primary key default gen_random_uuid(), broadcast_id uuid not null unique references public.broadcasts(id) on delete cascade,
  run_id uuid not null default gen_random_uuid(), revision bigint not null default 0,
  orders_enabled boolean not null default false, chat_enabled boolean not null default false, viewers_enabled boolean not null default false,
  max_active integer not null default 5 check(max_active between 1 and 10),
  next_order_at timestamptz, next_join_at timestamptz, last_submitted_at timestamptz,
  action_lease_until timestamptz, presence_lease_until timestamptz, last_result jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.live_automation_actors (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.live_automation_campaigns(id) on delete cascade,
  customer_id bigint not null references public.customers(id), nickname text not null, nickname_key text not null,
  profile jsonb not null, order_target integer not null check(order_target between 0 and 3),
  order_count integer not null default 0 check(order_count between 0 and 3),
  greeting_count integer not null default 0, last_chat_at timestamptz, created_at timestamptz not null default now(),
  unique(campaign_id,nickname_key)
);
create table public.live_automation_sessions (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.live_automation_campaigns(id) on delete cascade,
  run_id uuid not null, actor_id uuid not null references public.live_automation_actors(id) on delete cascade,
  visitor_key text not null unique default ('live-auto:'||gen_random_uuid()::text),
  cart_key text not null unique default ('live-auto:'||gen_random_uuid()::text),
  driver text not null default 'server' check(driver in ('server','browser')),
  watching boolean not null default false, joined_at timestamptz not null default now(), leave_at timestamptz not null,
  last_ack_at timestamptz, stopped_at timestamptz, reconnect_of uuid
);
create unique index live_automation_one_active_session on public.live_automation_sessions(actor_id) where stopped_at is null;
create index live_automation_session_due on public.live_automation_sessions(campaign_id,leave_at) where stopped_at is null;
create table public.live_automation_actions (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.live_automation_campaigns(id) on delete cascade,
  session_id uuid not null references public.live_automation_sessions(id), actor_id uuid not null references public.live_automation_actors(id),
  kind text not null check(kind in ('order','question','chat','reply')), manual boolean not null default false,
  due_at timestamptz not null, status text not null default 'pending' check(status in ('pending','claimed','succeeded','cancelled','skipped','uncertain','failed')),
  plan jsonb not null default '{}', revision bigint not null, lease_token uuid, lease_until timestamptz,
  order_group_id text not null unique default gen_random_uuid()::text, source_message_id bigint,
  result jsonb, asked_at timestamptz, created_at timestamptz not null default now(), completed_at timestamptz,
  unique(source_message_id)
);
create unique index live_automation_one_pending_order on public.live_automation_actions(actor_id) where kind='order' and status in ('pending','claimed','uncertain');
create unique index live_automation_one_manual on public.live_automation_actions(campaign_id) where manual and status in ('pending','claimed','uncertain');
create index live_automation_actions_due on public.live_automation_actions(campaign_id,kind,due_at) where status in ('pending','claimed');
create table public.live_automation_cart_holds (
  session_id uuid primary key references public.live_automation_sessions(id) on delete cascade,
  items jsonb not null, expires_at timestamptz not null
);
alter table public.orders add column if not exists automation_action_id uuid;
alter table public.orders add column if not exists automation_session_id uuid;
alter table public.orders add column if not exists automation_actor_id uuid;
create index if not exists orders_automation_action_idx on public.orders(automation_action_id) where automation_action_id is not null;
alter table public.live_chat_messages add column if not exists automation_action_id uuid;
alter table public.live_chat_messages add column if not exists automation_session_id uuid;
alter table public.live_chat_messages add column if not exists automation_actor_id uuid;
create unique index if not exists live_chat_automation_action_unique on public.live_chat_messages(automation_action_id) where automation_action_id is not null;
alter table public.visitor_presence add column if not exists automation_session_id uuid;
alter table public.visitor_presence add column if not exists automation_leave_at timestamptz;

-- Replaced by the pg_cron/pg_net adapter migration. Fail closed before installation/configuration.
create or replace function public.live_automation_schedule(p_enabled boolean) returns void
language plpgsql set search_path=pg_catalog,public as $$ begin
  if p_enabled then raise exception 'AUTOMATION_SCHEDULER_NOT_READY'; end if;
end $$;

create or replace function public.live_automation_control(p_broadcast uuid,p_feature text,p_enabled boolean,p_revision bigint)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; was_active boolean; begin
  perform pg_advisory_xact_lock(hashtextextended('live-automation-control',0));
  if p_feature not in ('orders','chat','viewers','all') then raise exception 'INVALID_FEATURE'; end if;
  if p_enabled and not exists(select 1 from public.broadcasts where id=p_broadcast and status='ON' and is_deleted is not true) then raise exception 'BROADCAST_ENDED'; end if;
  insert into public.live_automation_campaigns(broadcast_id) values(p_broadcast) on conflict(broadcast_id) do nothing;
  select * into c from public.live_automation_campaigns where broadcast_id=p_broadcast for update;
  if c.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
  was_active:=c.orders_enabled or c.chat_enabled or c.viewers_enabled;
  update public.live_automation_campaigns set
    orders_enabled=case when p_feature in ('orders','all') then p_enabled else orders_enabled end,
    chat_enabled=case when p_feature in ('chat','all') then p_enabled else chat_enabled end,
    viewers_enabled=case when p_feature in ('viewers','all') then p_enabled else viewers_enabled end,
    next_order_at=case when p_feature in ('orders','all') then case when p_enabled then clock_timestamp()+interval '5 minutes'+random()*interval '270 seconds' else null end else next_order_at end,
    next_join_at=case when p_feature in ('viewers','all') and p_enabled then clock_timestamp() else next_join_at end,
    run_id=case when not was_active and p_enabled then gen_random_uuid() else run_id end,
    revision=revision+1,updated_at=clock_timestamp() where id=c.id returning * into c;
  if not p_enabled then
    update public.live_automation_actions set status='cancelled',completed_at=clock_timestamp()
      where campaign_id=c.id and status in ('pending','claimed') and
      (p_feature='all' or (p_feature='orders' and (kind in ('order','question') or manual)) or (p_feature='chat' and kind in ('question','chat','reply')));
    if p_feature in ('viewers','all') then
      delete from public.visitor_presence where automation_session_id in(select id from public.live_automation_sessions where campaign_id=c.id);
      update public.live_automation_sessions set watching=false where campaign_id=c.id;
    end if;
  end if;
  -- Valid work from another enabled feature is refenced; old workers cannot write with their old revision.
  update public.live_automation_actions set revision=c.revision,status=case when status='claimed' then 'pending' else status end,lease_token=null,lease_until=null
    where campaign_id=c.id and status in ('pending','claimed');
  if not(c.orders_enabled or c.chat_enabled or c.viewers_enabled) then
    update public.live_automation_sessions set stopped_at=clock_timestamp(),watching=false where campaign_id=c.id and stopped_at is null;
    delete from public.live_automation_cart_holds where session_id in(select id from public.live_automation_sessions where campaign_id=c.id);
    update public.live_chat_messages set hidden_at=clock_timestamp(),hidden_by='automation-ended'
      where automation_session_id in(select id from public.live_automation_sessions where campaign_id=c.id) and hidden_at is null;
  end if;
  perform public.live_automation_schedule(exists(select 1 from public.live_automation_campaigns where orders_enabled or chat_enabled or viewers_enabled));
  return to_jsonb(c);
end $$;

create or replace function public.live_automation_reconnect(p_actor uuid,p_minutes integer,p_watch boolean) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; a public.live_automation_actors; s public.live_automation_sessions; inherited_leave timestamptz; prior_id uuid; begin
  select x.* into c from public.live_automation_campaigns x join public.live_automation_actors y on y.campaign_id=x.id where y.id=p_actor for update of x;
  select * into a from public.live_automation_actors where id=p_actor for update;
  if c.id is null or p_minutes not in(5,10,30,60,120) then raise exception 'INVALID_SESSION'; end if;
  if not exists(select 1 from public.broadcasts where id=c.broadcast_id and status='ON' and is_deleted is not true) then raise exception 'BROADCAST_ENDED'; end if;
  if p_watch and not c.viewers_enabled then raise exception 'VIEWERS_OFF'; end if;
  if p_watch and (select count(*) from public.live_automation_sessions where campaign_id=c.id and watching and stopped_at is null and leave_at>clock_timestamp())>=c.max_active then raise exception 'VIEWER_CAP'; end if;
  select * into s from public.live_automation_sessions where actor_id=a.id and stopped_at is null;
  if s.id is not null and s.leave_at>clock_timestamp() and (s.last_ack_at is null or s.last_ack_at>clock_timestamp()-interval '75 seconds') then return to_jsonb(s); end if;
  if s.id is not null and s.leave_at>clock_timestamp() then inherited_leave:=s.leave_at; prior_id:=s.id; end if;
  if s.id is not null then
    delete from public.visitor_presence where automation_session_id=s.id;
    update public.live_automation_actions set status='cancelled',completed_at=clock_timestamp() where session_id=s.id and status in('pending','claimed');
  end if;
  update public.live_automation_sessions set stopped_at=clock_timestamp(),watching=false where actor_id=a.id and stopped_at is null;
  insert into public.live_automation_sessions(campaign_id,run_id,actor_id,watching,leave_at,reconnect_of)
    values(c.id,c.run_id,a.id,p_watch,coalesce(inherited_leave,clock_timestamp()+make_interval(mins=>p_minutes)),prior_id) returning * into s;
  return to_jsonb(s);
end $$;

create or replace function public.live_automation_actor(p_broadcast uuid,p_nickname text,p_profile jsonb,p_target integer,p_minutes integer,p_watch boolean)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; a public.live_automation_actors; owner_id bigint; s jsonb; k text; begin
  select * into c from public.live_automation_campaigns where broadcast_id=p_broadcast for update;
  if c.id is null then raise exception 'NO_CAMPAIGN'; end if;
  k:=lower(regexp_replace(trim(normalize(p_nickname,NFC)),'\s+',' ','g'));
  if length(k)<1 or length(k)>40 or k~*'(테스트|test)' or exists(select 1 from public.live_automation_actors where campaign_id=c.id and nickname_key=k)
     or exists(select 1 from public.customers where lower(trim(youtube_nickname))=k) then raise exception 'NICKNAME_UNAVAILABLE'; end if;
  select id into strict owner_id from public.customers where kakao_id='990000000077';
  insert into public.live_automation_actors(campaign_id,customer_id,nickname,nickname_key,profile,order_target)
    values(c.id,owner_id,trim(p_nickname),k,p_profile,p_target) returning * into a;
  s:=public.live_automation_reconnect(a.id,p_minutes,p_watch);
  return jsonb_build_object('actor',to_jsonb(a),'session',s);
end $$;

create or replace function public.live_automation_context(p_session uuid,p_revision bigint,p_scope text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; s public.live_automation_sessions; a public.live_automation_actors; begin
  select x.* into c from public.live_automation_campaigns x join public.live_automation_sessions y on y.campaign_id=x.id where y.id=p_session for update of x;
  select * into s from public.live_automation_sessions where id=p_session;
  if c.id is null or s.stopped_at is not null or s.leave_at<=clock_timestamp() then raise exception 'SESSION_ENDED'; end if;
  if c.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
  if not exists(select 1 from public.broadcasts where id=c.broadcast_id and status='ON' and is_deleted is not true) then raise exception 'BROADCAST_ENDED'; end if;
  if p_scope='presence' and (not c.viewers_enabled or not s.watching) then raise exception 'SESSION_ENDED'; end if;
  if p_scope='chat' and not c.chat_enabled then raise exception 'CHAT_OFF'; end if;
  if p_scope not in ('presence','chat','order','cart') then raise exception 'INVALID_SCOPE'; end if;
  select * into a from public.live_automation_actors where id=s.actor_id;
  return jsonb_build_object('campaign',to_jsonb(c),'session',to_jsonb(s),'actor',to_jsonb(a));
end $$;

create or replace function public.live_automation_action(p_session uuid,p_kind text,p_due timestamptz,p_plan jsonb,p_manual boolean,p_source bigint,p_revision bigint)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare ctx jsonb; c public.live_automation_campaigns; a public.live_automation_actors; act public.live_automation_actions; begin
  ctx:=public.live_automation_context(p_session,p_revision,case when p_kind in ('chat','question','reply') then 'chat' else 'order' end);
  select * into c from public.live_automation_campaigns where id=(ctx->'campaign'->>'id')::uuid for update;
  select * into a from public.live_automation_actors where id=(ctx->'actor'->>'id')::uuid for update;
  if p_kind not in('order','chat','question','reply') or (p_manual and p_kind<>'order') then raise exception 'INVALID_ACTION'; end if;
  if p_kind in('order','question') and (a.order_count>=a.order_target or (not p_manual and not c.orders_enabled)) then raise exception 'ORDER_STOPPED'; end if;
  if p_manual and exists(select 1 from public.live_automation_actions where campaign_id=c.id and kind='order' and asked_at is not null and status in('pending','claimed')) then raise exception 'QUESTION_PENDING'; end if;
  insert into public.live_automation_actions(campaign_id,session_id,actor_id,kind,due_at,plan,manual,source_message_id,revision)
    values(c.id,p_session,a.id,p_kind,p_due,p_plan,p_manual,p_source,c.revision) returning * into act;
  return to_jsonb(act);
end $$;

create or replace function public.live_automation_claim(p_action uuid,p_revision bigint) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; a public.live_automation_actions; ctx jsonb; begin
  select x.* into c from public.live_automation_campaigns x join public.live_automation_actions y on y.campaign_id=x.id where y.id=p_action for update of x;
  select * into a from public.live_automation_actions where id=p_action for update;
  if a.id is null or c.revision<>p_revision or a.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
  if a.status='succeeded' then return to_jsonb(a); end if;
  if a.status not in('pending','claimed') or (a.status='claimed' and a.lease_until>clock_timestamp()) or a.due_at>clock_timestamp() then return null; end if;
  ctx:=public.live_automation_context(a.session_id,p_revision,case when a.kind='order' then 'order' else 'chat' end);
  if a.kind='order' and not a.manual and not c.orders_enabled then raise exception 'ORDER_STOPPED'; end if;
  update public.live_automation_actions set status='claimed',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds' where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create or replace function public.live_automation_assert_claim(p_action uuid,p_lease uuid,p_revision bigint,p_kind text) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; a public.live_automation_actions; ctx jsonb; begin
  select x.* into c from public.live_automation_campaigns x join public.live_automation_actions y on y.campaign_id=x.id where y.id=p_action for update of x;
  select * into a from public.live_automation_actions where id=p_action for update;
  if c.id is null or c.revision<>p_revision or a.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
  if a.kind<>p_kind or a.status<>'claimed' or a.lease_token is distinct from p_lease or a.lease_until<=clock_timestamp() then raise exception 'ACTION_STOPPED'; end if;
  ctx:=public.live_automation_context(a.session_id,p_revision,case when p_kind='order' then 'order' else 'chat' end);
  if p_kind='order' and not a.manual and not c.orders_enabled then raise exception 'ORDER_STOPPED'; end if;
  return ctx||jsonb_build_object('action',to_jsonb(a));
end $$;

create or replace function public.live_automation_complete(p_action uuid,p_lease uuid,p_status text,p_result jsonb) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare a public.live_automation_actions; begin
  if p_status not in('succeeded','skipped','failed','uncertain','cancelled') then raise exception 'INVALID_OUTCOME'; end if;
  select * into a from public.live_automation_actions where id=p_action;
  perform 1 from public.live_automation_campaigns where id=a.campaign_id for update;
  update public.live_automation_actions set status=p_status,result=p_result,completed_at=clock_timestamp()
    where id=p_action and status='claimed' and lease_token=p_lease returning * into a;
  if not found then return; end if;
  update public.live_automation_campaigns set last_result=p_result||jsonb_build_object('at',clock_timestamp()) where id=a.campaign_id;
  if a.manual then
    delete from public.live_automation_cart_holds where session_id=a.session_id;
    update public.live_automation_sessions set stopped_at=clock_timestamp(),watching=false where id=a.session_id and not watching;
  end if;
end $$;

create or replace function public.live_automation_presence(p_session uuid,p_revision bigint,p_path text) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare ctx jsonb; s public.live_automation_sessions; a public.live_automation_actors; t timestamptz:=clock_timestamp(); begin
  ctx:=public.live_automation_context(p_session,p_revision,'presence');
  select * into s from public.live_automation_sessions where id=p_session for update;
  select * into a from public.live_automation_actors where id=s.actor_id;
  if s.last_ack_at is not null and s.last_ack_at<t-interval '75 seconds' then raise exception 'SESSION_EXPIRED'; end if;
  if p_path not like '/order%' then raise exception 'INVALID_WATCH_PATH'; end if;
  insert into public.visitor_presence(visitor_key,nickname,page_type,path,last_seen_at,updated_at,kakao_id,automation_session_id,automation_leave_at)
    values(s.visitor_key,a.nickname,'order_form',left(p_path,200),t,t,'990000000077',s.id,s.leave_at)
    on conflict(visitor_key) do update set nickname=excluded.nickname,page_type=excluded.page_type,path=excluded.path,last_seen_at=t,updated_at=t,automation_leave_at=s.leave_at;
  update public.live_automation_sessions set last_ack_at=t where id=s.id;
  return jsonb_build_object('ok',true,'lastSeenAt',t);
end $$;

-- Same catalog and option facts used by cart and final submission; lock rows across the common save.
create or replace function public.live_automation_check_items(p_broadcast uuid,p_items jsonb) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare item jsonb; p public.products; n jsonb; v jsonb; inventory_color text; stock integer; held integer; wanted integer; unit numeric; begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then raise exception 'INVALID_ITEMS'; end if;
  for item in select value from jsonb_array_elements(p_items) order by (value->>'productId')::bigint loop
    select * into p from public.products where id=(item->>'productId')::bigint for update;
    if p.id is null or (to_jsonb(p)->>'is_visible')::boolean is false or p.status in('hidden','숨김','deleted','판매중지','품절') or p.product_status in('hidden','숨김','deleted','판매중지','품절') or not exists(select 1 from public.broadcast_products bp where broadcast_id=p_broadcast and product_id=p.id and (to_jsonb(bp)->>'is_visible')::boolean is not false) then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    n:=coalesce(nullif(p.product_note,'')::jsonb,'{}');
    wanted:=(item->>'qty')::integer;
    if wanted<1 or wanted>3 then raise exception 'INVALID_QUANTITY'; end if;
    if public.ruru_option_manual_soldout(n,item->>'color',item->>'size',item->>'productName') then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    unit:=p.price;
    if coalesce((n->'brand_group'->>'enabled')::boolean,false) then
      if not (n->'brand_group'->'detail_options' ? (item->>'productName')) or (n->'combo_hidden' ? (item->>'productName')) then raise exception 'PRODUCT_UNAVAILABLE'; end if;
      unit:=unit+greatest(0,coalesce((n->'option_pricing'->>(item->>'productName'))::numeric,0));
    elsif p.product_name is distinct from item->>'productName' then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if unit is distinct from (item->>'unitPrice')::numeric or unit<=0 then raise exception 'PRICE_CHANGED'; end if;
    if coalesce((n->>'stock_management_enabled')::boolean,false) then
      inventory_color:=coalesce(nullif(item->>'color','없음'),'');
      if n->'brand_group'->'detail_options' ? (item->>'productName') then inventory_color:=(item->>'productName')||' / '||coalesce(nullif(inventory_color,''),'없음'); end if;
      select value into v from jsonb_array_elements(coalesce(n->'stock_variants','[]'))
        where coalesce(nullif(value->>'color','없음'),'')=inventory_color and coalesce(nullif(value->>'size','없음'),'')=coalesce(nullif(item->>'size','없음'),'') limit 1;
      stock:=coalesce((v->>'stock')::integer,0);
      select coalesce(sum(qty),0) into held from public.cart_reservations where product_id=p.id::text and expires_at>clock_timestamp()
        and coalesce(nullif(color,'없음'),'')=inventory_color and coalesce(nullif(size,'없음'),'')=coalesce(nullif(item->>'size','없음'),'');
      if wanted>stock-held then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    end if;
  end loop;
end $$;

create or replace function public.live_automation_cart(p_session uuid,p_revision bigint,p_items jsonb) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare ctx jsonb; begin
  ctx:=public.live_automation_context(p_session,p_revision,'cart');
  if not exists(select 1 from public.live_automation_actions where session_id=p_session and kind='order' and status='claimed' and revision=p_revision) then raise exception 'ACTION_STOPPED'; end if;
  perform public.live_automation_check_items((ctx->'campaign'->>'broadcast_id')::uuid,p_items);
  insert into public.live_automation_cart_holds values(p_session,p_items,clock_timestamp()+interval '3 minutes')
    on conflict(session_id) do update set items=excluded.items,expires_at=excluded.expires_at;
  return jsonb_build_object('ok',true,'results',(select jsonb_agg(value||'{"ok":true}'::jsonb) from jsonb_array_elements(p_items)));
end $$;

create or replace function public.live_automation_submit(p_action uuid,p_lease uuid,p_revision bigint,p_rows jsonb) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare ctx jsonb; a public.live_automation_actions; actor public.live_automation_actors; c public.live_automation_campaigns;
  lines jsonb; safe_rows jsonb; v_result jsonb; t timestamptz:=clock_timestamp(); begin
  select x.* into c from public.live_automation_campaigns x join public.live_automation_actions y on y.campaign_id=x.id where y.id=p_action for update of x;
  select * into a from public.live_automation_actions where id=p_action for update;
  if a.status='succeeded' then return a.result; end if;
  ctx:=public.live_automation_assert_claim(p_action,p_lease,p_revision,'order');
  select * into actor from public.live_automation_actors where id=a.actor_id for update;
  if actor.order_count>=actor.order_target then raise exception 'ORDER_TARGET_REACHED'; end if;
  if a.asked_at is not null and (t<a.asked_at+interval '30 seconds' or t>a.asked_at+interval '120 seconds') then raise exception 'QUESTION_WINDOW_EXPIRED'; end if;
  if not a.manual and c.last_submitted_at is not null and t<c.last_submitted_at+interval '5 minutes' then raise exception 'ORDER_TOO_EARLY'; end if;
  lines:=a.plan->'lines';
  perform public.live_automation_check_items(c.broadcast_id,lines);
  if jsonb_array_length(p_rows)<>jsonb_array_length(lines) or exists(
    select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from jsonb_array_elements(lines) l
      where r->>'product_id'=l->>'productId' and r->>'product_name'=l->>'productName' and coalesce(r->>'color','')=coalesce(l->>'color','') and coalesce(r->>'size','')=coalesce(l->>'size','') and (r->>'qty')::int=(l->>'qty')::int)) then raise exception 'ORDER_PLAN_MISMATCH'; end if;
  if not exists(select 1 from public.live_automation_cart_holds where session_id=a.session_id and expires_at>t and items=lines) then raise exception 'CART_EXPIRED'; end if;
  select jsonb_agg(value||jsonb_build_object('order_group_id',a.order_group_id,'broadcast_id',c.broadcast_id,'youtube_nickname',actor.nickname,
    'is_test_order',true,'test_order_reason','자동 테스트','operator_test_phone','0200000077',
    'exclude_from_settlement',true,'exclude_from_payment_match',true,'exclude_from_shipping',true,'exclude_from_picking',true)) into safe_rows from jsonb_array_elements(p_rows);
  perform set_config('ruru.live_automation_action',a.id::text,true);
  -- This is the existing customer storage path, not a separate direct insert implementation.
  v_result:=public.submit_customer_order_with_bank_routing(safe_rows,0,'0200000077',actor.nickname,'운영 확인',ctx->'session'->>'cart_key','990000000077');
  update public.orders set customer_id=actor.customer_id,automation_action_id=a.id,automation_session_id=a.session_id,automation_actor_id=a.actor_id where order_group_id=a.order_group_id;
  perform set_config('ruru.live_automation_action','',true);
  update public.live_automation_actors set order_count=order_count+1 where id=actor.id;
  update public.live_automation_actions set status='succeeded',result=v_result,completed_at=t where id=a.id;
  update public.live_automation_campaigns set last_submitted_at=t,next_order_at=case when orders_enabled then t+interval '5 minutes'+random()*interval '270 seconds' else null end,
    last_result=jsonb_build_object('at',t,'ok',true,'message','주문서 제출 확인 · '||actor.nickname,'driver',ctx->'session'->>'driver') where id=c.id;
  delete from public.live_automation_cart_holds where session_id=a.session_id;
  return v_result;
end $$;

create or replace function public.live_automation_chat(p_action uuid,p_lease uuid,p_revision bigint,p_body text) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare ctx jsonb; a public.live_automation_actions; msg public.live_chat_messages; target public.live_automation_actions; begin
  select * into a from public.live_automation_actions where id=p_action;
  ctx:=public.live_automation_assert_claim(p_action,p_lease,p_revision,a.kind);
  if a.kind not in('question','chat','reply') or length(trim(p_body)) not between 1 and 100 or p_body~*'(테스트|\mtest\M|\mAI\M|API|프롬프트|한도|시스템|결제.{0,3}완료|입금.{0,3}완료|https?://)' then raise exception 'INVALID_CHAT'; end if;
  if a.kind='question' then
    select * into target from public.live_automation_actions where id=(a.plan->>'orderAction')::uuid for update;
    if target.actor_id<>a.actor_id or target.status<>'pending' or not (ctx->'campaign'->>'orders_enabled')::boolean
      or target.due_at<clock_timestamp()+interval '30 seconds' or target.due_at>clock_timestamp()+interval '90 seconds' then raise exception 'QUESTION_WINDOW_EXPIRED'; end if;
    perform public.live_automation_check_items((ctx->'campaign'->>'broadcast_id')::uuid,target.plan->'lines');
  end if;
  if a.kind='reply' and not exists(select 1 from public.live_chat_messages where id=a.source_message_id and hidden_at is null and coalesce(avatar_url,'')<>'autotest') then raise exception 'SOURCE_UNAVAILABLE'; end if;
  insert into public.live_chat_messages(broadcast_id,kakao_id,customer_id,nickname,body,avatar_url,automation_action_id,automation_session_id,automation_actor_id)
    values((ctx->'campaign'->>'broadcast_id')::uuid,'990000000077',(ctx->'actor'->>'customer_id')::bigint,ctx->'actor'->>'nickname',trim(p_body),'autotest',a.id,a.session_id,a.actor_id)
    on conflict(automation_action_id) where automation_action_id is not null do update set body=live_chat_messages.body returning * into msg;
  if a.kind='question' then update public.live_automation_actions set asked_at=msg.created_at where id=target.id; end if;
  update public.live_automation_actors set last_chat_at=msg.created_at,greeting_count=greeting_count+case when a.kind='chat' then 1 else 0 end where id=a.actor_id;
  update public.live_automation_actions set status='succeeded',completed_at=clock_timestamp(),result=jsonb_build_object('messageId',msg.id) where id=a.id;
  return to_jsonb(msg);
end $$;

create or replace function public.live_automation_verified_order(p_group text) returns boolean
language sql stable set search_path=pg_catalog,public as $$
  select exists(select 1 from public.live_automation_actions where id::text=nullif(current_setting('ruru.live_automation_action',true),'') and order_group_id=p_group and kind='order' and status='claimed');
$$;

create or replace function public.live_automation_order_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare j jsonb:=to_jsonb(new); oldj jsonb; automatic boolean; begin
  if tg_op='UPDATE' then oldj:=to_jsonb(old); end if;
  automatic:=coalesce(j->>'kakao_id','')='990000000077' or coalesce(j->>'operator_test_phone','')='0200000077' or j->>'automation_action_id' is not null
    or coalesce(oldj->>'operator_test_phone','')='0200000077' or oldj->>'automation_action_id' is not null;
  if not automatic then return new; end if;
  if tg_op='INSERT' and not public.live_automation_verified_order(new.order_group_id) then raise exception 'AUTOMATION_AUTH_REQUIRED'; end if;
  if new.is_test_order is not true or new.exclude_from_settlement is not true or new.exclude_from_payment_match is not true
     or new.exclude_from_shipping is not true or new.exclude_from_picking is not true then raise exception 'AUTOMATION_PROVENANCE_REQUIRED'; end if;
  if concat_ws(' ',j->>'admin_order_status_v2',j->>'order_status',j->>'order_manage_status',j->>'admin_order_status',j->>'deposit_status',j->>'shipping_status') ~ '입금확인|결제완료|출고완료|배송완료'
    or coalesce((j->>'point_used_amount')::numeric,0)>0 or coalesce((j->>'point_earned_amount')::numeric,0)>0
    or coalesce((j->>'point_refunded_amount')::numeric,0)>0 or j->>'deposit_confirmed_at' is not null
    or j->>'inventory_deducted_at' is not null then raise exception 'AUTOMATION_FINANCIAL_EFFECT_BLOCKED'; end if;
  return new;
end $$;
create trigger live_automation_order_guard before insert or update on public.orders for each row execute function public.live_automation_order_guard();

create or replace function public.live_automation_broadcast_end() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; begin
  if (new.status is distinct from 'ON' or new.is_deleted is true) then
    select * into c from public.live_automation_campaigns where broadcast_id=new.id;
    if c.id is not null and (c.orders_enabled or c.chat_enabled or c.viewers_enabled) then perform public.live_automation_control(new.id,'all',false,c.revision); end if;
  end if;
  return new;
end $$;
create trigger live_automation_broadcast_end after update of status,is_deleted on public.broadcasts for each row execute function public.live_automation_broadcast_end();

-- No browser can read session profiles, issue commands or invoke privileged functions directly.
do $$ declare t text; f record; begin
  foreach t in array array['live_automation_campaigns','live_automation_actors','live_automation_sessions','live_automation_actions','live_automation_cart_holds'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'live_automation_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.sig);
    execute format('grant execute on function %s to service_role',f.sig);
  end loop;
end $$;
