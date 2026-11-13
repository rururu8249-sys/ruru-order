-- Originals stay service-only; public history and realtime carry an opaque stable avatar.
alter table public.live_chat_messages add column if not exists public_avatar_id integer check(public_avatar_id between 0 and 4999);
create or replace function public.live_chat_avatar_index(p_actor uuid,p_kakao text,p_nickname text) returns integer
language sql immutable set search_path=public as $$
 select (('x'||substr(md5(coalesce(p_actor::text,nullif(p_kakao,''),p_nickname)),1,8))::bit(32)::bigint % 5000)::integer;
$$;
create or replace function public.live_chat_assign_avatar() returns trigger
language plpgsql set search_path=public as $$
begin
 new.public_avatar_id:=public.live_chat_avatar_index(new.automation_actor_id,new.kakao_id,new.nickname);
 return new;
end;
$$;
create trigger z_live_chat_assign_avatar before insert or update of kakao_id,automation_actor_id on public.live_chat_messages for each row execute function public.live_chat_assign_avatar();
update public.live_chat_messages set public_avatar_id=public.live_chat_avatar_index(automation_actor_id,kakao_id,nickname) where public_avatar_id is null;
alter table public.live_chat_messages enable row level security;
revoke all on public.live_chat_messages from anon,authenticated;
create or replace function public.ruru_live_chat_event() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 begin
  perform realtime.send(jsonb_build_object(
    'type',TG_OP,'id',NEW.id,'broadcast_id',NEW.broadcast_id,'nickname',NEW.nickname,
    'body',case when NEW.hidden_at is null then NEW.body else '' end,
    'created_at',NEW.created_at,'hidden',NEW.hidden_at is not null,'badge',NEW.badge,
    'avatar_url','public:'||NEW.public_avatar_id::text,'bot_ref',NEW.bot_ref,
    'pinned',NEW.pinned_at is not null and NEW.hidden_at is null
  ),'chat','ruru-live',false);
 exception when others then null;
 end;
 return null;
end;
$$;
revoke all on function public.live_chat_avatar_index(uuid,text,text),public.live_chat_assign_avatar(),public.ruru_live_chat_event() from public,anon,authenticated;
grant execute on function public.live_chat_avatar_index(uuid,text,text) to service_role;

-- Per-broadcast photo identity. Re-entry changes one profile and all existing rows, not the order/customer.
create table public.live_chat_public_profiles (
 id uuid primary key default gen_random_uuid(), broadcast_id uuid not null references public.broadcasts(id),
 identity_key text not null, avatar_id integer not null check(avatar_id between 0 and 4999),
 last_entry uuid, updated_at timestamptz not null default clock_timestamp(),
 unique(broadcast_id,identity_key)
);
alter table public.live_chat_public_profiles enable row level security;
revoke all on public.live_chat_public_profiles from public,anon,authenticated;
grant all on public.live_chat_public_profiles to service_role;
alter table public.live_chat_messages add column public_avatar_key uuid;
insert into public.live_chat_public_profiles(broadcast_id,identity_key,avatar_id)
 select distinct on(broadcast_id,coalesce(automation_actor_id::text,kakao_id)) broadcast_id,coalesce(automation_actor_id::text,kakao_id),public_avatar_id
 from public.live_chat_messages where badge is distinct from 'bot' on conflict do nothing;
update public.live_chat_messages m set public_avatar_key=p.id,public_avatar_id=p.avatar_id
 from public.live_chat_public_profiles p where p.broadcast_id=m.broadcast_id and p.identity_key=coalesce(m.automation_actor_id::text,m.kakao_id) and m.badge is distinct from 'bot';
create or replace function public.live_chat_assign_avatar() returns trigger language plpgsql set search_path=public as $$
declare p public.live_chat_public_profiles;begin
 if new.badge='bot' then new.public_avatar_id:=0;return new;end if;
 insert into public.live_chat_public_profiles(broadcast_id,identity_key,avatar_id)
 values(new.broadcast_id,coalesce(new.automation_actor_id::text,new.kakao_id),floor(random()*5000)::int)
 on conflict(broadcast_id,identity_key) do nothing;
 select * into p from public.live_chat_public_profiles where broadcast_id=new.broadcast_id and identity_key=coalesce(new.automation_actor_id::text,new.kakao_id);
 new.public_avatar_id:=p.avatar_id;new.public_avatar_key:=p.id;return new;
end $$;
create or replace function public.live_chat_rotate_avatar(p_broadcast uuid,p_identity text,p_entry uuid) returns jsonb
language plpgsql set search_path=public as $$
declare p public.live_chat_public_profiles; n integer;begin
 perform 1 from public.broadcasts where id=p_broadcast and status='ON' for share;
 if not found then raise exception 'BROADCAST_ENDED';end if;
 if p_identity is null or length(p_identity)>64 or p_entry is null then raise exception 'INVALID_IDENTITY';end if;
 insert into public.live_chat_public_profiles(broadcast_id,identity_key,avatar_id,last_entry) values(p_broadcast,p_identity,floor(random()*5000)::int,p_entry) on conflict do nothing;
 select * into p from public.live_chat_public_profiles where broadcast_id=p_broadcast and identity_key=p_identity for update;
 if p.last_entry is distinct from p_entry then
  -- A double tap/network retry is idempotent; repeated open/close cannot create an event storm.
  if p.last_entry is not null and p.updated_at>clock_timestamp()-interval '5 seconds' then return jsonb_build_object('key',p.id,'avatar',p.avatar_id);end if;
  n:=(p.avatar_id+1+floor(random()*4999)::int)%5000;
  update public.live_chat_public_profiles set avatar_id=n,last_entry=p_entry,updated_at=clock_timestamp() where id=p.id returning * into p;
  update public.live_chat_messages set public_avatar_id=n where public_avatar_key=p.id;
  perform realtime.send(jsonb_build_object('table','live_chat_avatars:'||p_broadcast::text,'type','UPDATE'),'catalog','ruru-live',false);
 end if;
 return jsonb_build_object('key',p.id,'avatar',p.avatar_id);
end $$;
revoke all on function public.live_chat_rotate_avatar(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.live_chat_rotate_avatar(uuid,text,uuid) to service_role;
-- Append only public random key, never account identity or the original photo.
do $$declare def text;begin
 select pg_get_functiondef('public.ruru_live_chat_event()'::regprocedure) into def;
 def:=replace(def,'''public:''||NEW.public_avatar_id::text','''public:''||NEW.public_avatar_id::text||case when NEW.public_avatar_key is null then '''' else '':''||NEW.public_avatar_key::text end');
 execute def;
end $$;
-- Generated nicknames use the same per-broadcast profile on their independent session re-entry.
create or replace function public.live_automation_entry_avatar() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare bc uuid;begin
 select c.broadcast_id into bc from public.live_automation_campaigns c join public.broadcasts b on b.id=c.broadcast_id where c.id=new.campaign_id and b.status='ON';
 if bc is not null then perform public.live_chat_rotate_avatar(bc,new.actor_id::text,new.id);end if;
 return new;
end $$;
create trigger live_automation_entry_avatar after insert on public.live_automation_sessions for each row execute function public.live_automation_entry_avatar();
revoke all on function public.live_automation_entry_avatar() from public,anon,authenticated;
