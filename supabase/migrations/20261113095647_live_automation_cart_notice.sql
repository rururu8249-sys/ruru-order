-- Publish a cart notice only after the authenticated cart has actually been saved.
alter table public.live_chat_messages add column automation_cart_action_id uuid;
create unique index live_automation_cart_message_once on public.live_chat_messages(automation_cart_action_id) where automation_cart_action_id is not null;
create or replace function public.live_automation_cart_notice_valid(p_action uuid,p_actor uuid,p_session uuid,p_broadcast uuid,p_body text,p_ref text) returns boolean
language sql stable set search_path=pg_catalog,public as $$
 select coalesce(p_action::text=nullif(current_setting('ruru.live_automation_cart_notice',true),'') and exists(
 select 1 from public.live_automation_actions a join public.live_automation_campaigns c on c.id=a.campaign_id
 join public.live_automation_sessions s on s.id=a.session_id join public.live_automation_cart_holds h on h.session_id=s.id
 join public.broadcasts b on b.id=c.broadcast_id
 where a.id=p_action and a.actor_id=p_actor and s.id=p_session and c.broadcast_id=p_broadcast
 and a.kind='order' and a.status='claimed' and a.revision=c.revision and a.lease_until>clock_timestamp()
 and (c.orders_enabled or a.manual) and s.stopped_at is null and s.leave_at>clock_timestamp()
 and b.status='ON' and b.is_deleted is not true and h.expires_at>clock_timestamp() and h.items=a.plan->'lines'
 and a.plan->'cartNotice'->>'body'=p_body and a.plan->'cartNotice'->>'ref'=p_ref),false);
$$;
create or replace function public.live_automation_cart_notice_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$ begin
 if new.automation_cart_action_id is not null and (new.kakao_id is distinct from 'bot:ruru' or new.badge is distinct from 'bot' or not public.live_automation_cart_notice_valid(new.automation_cart_action_id,new.automation_actor_id,new.automation_session_id,new.broadcast_id,new.body,new.bot_ref)) then raise exception 'CART_NOTICE_UNAUTHORIZED'; end if;
 return new;
end $$;
create trigger live_automation_cart_notice_guard before insert on public.live_chat_messages for each row execute function public.live_automation_cart_notice_guard();
do $$ declare sig text; original text; source text; begin
 foreach sig in array array['public.live_automation_chat_identity_guard()','public.live_automation_sparse_chat_guard()'] loop
 select pg_get_functiondef(sig::regprocedure) into original;
 source:=regexp_replace(original,'begin','begin
 if new.automation_cart_action_id is not null and new.kakao_id=''bot:ruru'' and new.badge=''bot'' and public.live_automation_cart_notice_valid(new.automation_cart_action_id,new.automation_actor_id,new.automation_session_id,new.broadcast_id,new.body,new.bot_ref) then return new; end if;', 'i');
 if source=original then raise exception 'CART_GUARD_PATCH_FAILED'; end if; execute source;
 end loop;
end $$;
create or replace function public.live_automation_announce_cart(p_action uuid,p_lease uuid,p_revision bigint,p_body text,p_ref text) returns bigint
language plpgsql set search_path=pg_catalog,public as $$
declare ctx jsonb; a public.live_automation_actions; msg bigint; begin
 perform public.live_automation_identity_lock();
 ctx:=public.live_automation_assert_claim(p_action,p_lease,p_revision,'order');
 select * into a from public.live_automation_actions where id=p_action for update;
 select id into msg from public.live_chat_messages where automation_cart_action_id=p_action;
 if msg is not null then return msg; end if;
 if p_body is null or p_body not like '🛍️ %님 장바구니 담음 · %' or length(p_body)>300 or p_ref is null or p_ref not like 'c:%' then raise exception 'INVALID_CART_NOTICE'; end if;
 update public.live_automation_actions set plan=plan||jsonb_build_object('cartNotice',jsonb_build_object('body',p_body,'ref',p_ref)) where id=a.id;
 perform set_config('ruru.live_automation_cart_notice',a.id::text,true);
 insert into public.live_chat_messages(broadcast_id,kakao_id,nickname,body,badge,bot_ref,automation_actor_id,automation_session_id,automation_cart_action_id)
 values((ctx->'campaign'->>'broadcast_id')::uuid,'bot:ruru','루루동이',p_body,'bot',p_ref,a.actor_id,a.session_id,a.id) on conflict do nothing returning id into msg;
 perform set_config('ruru.live_automation_cart_notice','',true);
 return msg;
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname like 'live_automation_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
