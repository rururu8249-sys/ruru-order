alter table public.live_automation_campaigns add column action_lease_token uuid;
alter table public.live_automation_campaigns add column presence_lease_token uuid;

create or replace function public.live_automation_ensure_campaign(p_broadcast uuid) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; begin
 perform public.live_automation_identity_lock();
 if not exists(select 1 from public.broadcasts where id=p_broadcast and status='ON' and is_deleted is not true) then raise exception 'BROADCAST_ENDED'; end if;
 insert into public.live_automation_campaigns(broadcast_id) values(p_broadcast) on conflict(broadcast_id) do nothing;
 select * into c from public.live_automation_campaigns where broadcast_id=p_broadcast;
 return to_jsonb(c);
end $$;
create or replace function public.live_automation_tick_claim(p_campaign uuid,p_kind text,p_revision bigint) returns uuid
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; token uuid:=gen_random_uuid(); begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 if c.id is null or c.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
 if p_kind='presence' then
   if not c.viewers_enabled or c.presence_lease_until>clock_timestamp() then return null; end if;
   update public.live_automation_campaigns set presence_lease_until=clock_timestamp()+interval '25 seconds',presence_lease_token=token where id=c.id;
 elsif p_kind='actions' then
   if not(c.orders_enabled or c.chat_enabled) or c.action_lease_until>clock_timestamp() then return null; end if;
   update public.live_automation_campaigns set action_lease_until=clock_timestamp()+interval '45 seconds',action_lease_token=token where id=c.id;
 else raise exception 'INVALID_KIND'; end if;
 return token;
end $$;
create or replace function public.live_automation_tick_release(p_campaign uuid,p_kind text,p_token uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
begin
 perform public.live_automation_identity_lock();
 if p_kind='actions' then update public.live_automation_campaigns set action_lease_until=null,action_lease_token=null where id=p_campaign and action_lease_token=p_token;
 elsif p_kind='presence' then update public.live_automation_campaigns set presence_lease_until=null,presence_lease_token=null where id=p_campaign and presence_lease_token=p_token; end if;
end $$;

create or replace function public.live_automation_clear_cart(p_session uuid,p_revision bigint) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
begin
 perform public.live_automation_context(p_session,p_revision,'cart');
 delete from public.live_automation_cart_holds where session_id=p_session;
 return jsonb_build_object('ok',true,'cleared',true);
end $$;
create or replace function public.live_automation_stage_order(p_action uuid,p_lease uuid,p_revision bigint,p_submit_at timestamptz) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare ctx jsonb; a public.live_automation_actions; begin
 ctx:=public.live_automation_assert_claim(p_action,p_lease,p_revision,'order');
 if p_submit_at<clock_timestamp()+interval '14 seconds' or p_submit_at>clock_timestamp()+interval '151 seconds'
 or p_submit_at>=(ctx->'session'->>'leave_at')::timestamptz then raise exception 'INVALID_SUBMIT_WINDOW'; end if;
 if not exists(select 1 from public.live_automation_cart_holds where session_id=(ctx->'session'->>'id')::uuid and expires_at>p_submit_at) then raise exception 'CART_EXPIRED'; end if;
 update public.live_automation_actions set status='pending',lease_token=null,lease_until=null,due_at=p_submit_at,plan=plan||'{"stage":"submit"}'::jsonb
 where id=p_action returning * into a;
 return to_jsonb(a);
end $$;
create or replace function public.live_automation_expire(p_campaign uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 update public.live_automation_sessions set stopped_at=clock_timestamp(),watching=false where campaign_id=c.id and stopped_at is null
 and leave_at<=clock_timestamp();
 delete from public.visitor_presence where automation_session_id in(select id from public.live_automation_sessions where campaign_id=c.id and (stopped_at is not null or last_ack_at<clock_timestamp()-interval '75 seconds'));
 delete from public.live_automation_cart_holds where expires_at<=clock_timestamp()
 or session_id in(select id from public.live_automation_sessions where campaign_id=c.id and stopped_at is not null);
 update public.live_automation_actions set status='cancelled',completed_at=clock_timestamp() where campaign_id=c.id and status in('pending','claimed')
 and session_id in(select id from public.live_automation_sessions where stopped_at is not null);
end $$;
do $$
declare original text; source text; f record; begin
 select pg_get_functiondef('public.live_automation_cart(uuid,bigint,jsonb)'::regprocedure) into original;
 source:=replace(original,'interval ''3 minutes''','interval ''5 minutes''');
 if source=original then raise exception 'CART_TTL_PATCH_FAILED'; end if; execute source;
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'live_automation_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

-- Recovery keeps the action/group identity; late HTTP work has the old, fenced lease.
do $$
declare original text; source text; begin
 select pg_get_functiondef('public.live_automation_reconnect(uuid,integer,boolean)'::regprocedure) into original;
 source:=replace(original,'where campaign_id=c.id and watching and stopped_at is null and leave_at>clock_timestamp()',
 'where campaign_id=c.id and actor_id<>a.id and watching and stopped_at is null and leave_at>clock_timestamp()');
 if source=original then raise exception 'RECONNECT_CAP_PATCH_FAILED'; end if; execute source;
 select pg_get_functiondef('public.live_automation_claim(uuid,bigint)'::regprocedure) into original;
 source:=replace(original,'a.status not in(''pending'',''claimed'')','a.status not in(''pending'',''claimed'',''uncertain'') or (a.status=''uncertain'' and a.completed_at>clock_timestamp()-interval ''30 seconds'')');
 if source=original then raise exception 'RECOVERY_PATCH_FAILED'; end if; execute source;
end $$;
