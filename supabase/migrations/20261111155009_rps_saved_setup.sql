-- Saving the next game is separate from opening recruitment; private to operators.
create table public.rps_setup (
 id int primary key check(id=1), revision bigint not null default 0,
 config jsonb not null
);
insert into public.rps_setup values(1,0,'{"title":"가위·바위·보 루루를 이겨라!","winners":1,"rewardKind":"points","points":1000,"gift":"","joinSeconds":300,"pickSeconds":5,"auto":true}');
alter table public.rps_setup enable row level security;
revoke all on public.rps_setup from public,anon,authenticated;
grant all on public.rps_setup to service_role;

create function public.rps_save_setup(p_config jsonb,p_expected bigint) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare s rps_setup%rowtype; c jsonb;
begin
 perform pg_advisory_xact_lock(84266710);
 select * into s from rps_setup where id=1 for update;
 if s.revision<>p_expected then raise exception '다른 관리자가 설정을 변경했어요. 설정을 다시 열어 확인하세요.';end if;
 if exists(select 1 from rps_rooms where status<>'closed') then raise exception '진행 중인 게임의 설정에서 변경해 주세요.';end if;
 if not coalesce(jsonb_typeof(p_config->'title')='string' and length(trim(p_config->>'title')) between 1 and 80
 and jsonb_typeof(p_config->'winners')='number' and (p_config->>'winners') ~ '^\d+$' and (p_config->>'winners')::int between 1 and 1000
 and p_config->>'rewardKind' in ('points','gift','none')
 and jsonb_typeof(p_config->'points')='number' and (p_config->>'points') ~ '^\d+$' and (p_config->>'points')::int between 1 and 100000
 and jsonb_typeof(p_config->'gift')='string' and length(p_config->>'gift')<=40
 and (p_config->>'rewardKind'<>'gift' or length(trim(p_config->>'gift'))>0)
 and jsonb_typeof(p_config->'auto')='boolean'
 and jsonb_typeof(p_config->'joinSeconds')='number' and (p_config->>'joinSeconds') ~ '^\d+$' and (p_config->>'joinSeconds')::int between 10 and 1800
 and jsonb_typeof(p_config->'pickSeconds')='number' and (p_config->>'pickSeconds') ~ '^\d+$' and (p_config->>'pickSeconds')::int between 3 and 30,false)
 then raise exception '설정값을 확인해 주세요.';end if;
 c:=jsonb_build_object('title',trim(p_config->>'title'),'winners',(p_config->>'winners')::int,'rewardKind',p_config->>'rewardKind','points',(p_config->>'points')::int,'gift',trim(p_config->>'gift'),'auto',(p_config->>'auto')::boolean,'joinSeconds',(p_config->>'joinSeconds')::int,'pickSeconds',(p_config->>'pickSeconds')::int);
 update rps_setup set config=c,revision=revision+1 where id=1 returning * into s;
 perform realtime.send('{"setup":true}'::jsonb,'changed','ruru-rps',false);
 return jsonb_build_object('config',s.config,'revision',s.revision);
end $$;

create function public.rps_create_saved_setup(p_context jsonb,p_expected bigint,p_setup_expected bigint) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare s rps_setup%rowtype;
begin
 perform pg_advisory_xact_lock(84266710);
 select * into s from rps_setup where id=1 for update;
 if s.revision<>p_setup_expected then raise exception '다른 관리자가 설정을 변경했어요. 확인 후 다시 시작하세요.';end if;
 if s.revision=0 then raise exception '설정을 먼저 저장해 주세요.';end if;
 return rps_admin('create',s.config||jsonb_build_object('test',coalesce((p_context->>'test')::boolean,false),'broadcastId',p_context->>'broadcastId'),p_expected);
end $$;
revoke all on function public.rps_save_setup(jsonb,bigint), public.rps_create_saved_setup(jsonb,bigint,bigint) from public,anon,authenticated;
grant execute on function public.rps_save_setup(jsonb,bigint), public.rps_create_saved_setup(jsonb,bigint,bigint) to service_role;

-- One Save handles settings and an optional recruitment-time change atomically.
create function public.rps_update_settings(p_config jsonb,p_expected bigint) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare r rps_rooms%rowtype; result jsonb;
begin
 perform pg_advisory_xact_lock(84266710);
 select * into r from rps_rooms where status<>'closed' limit 1 for update;
 if r.id::text is distinct from p_config->>'_roomId' then raise exception '게임이 바뀌었어요. 설정을 다시 열어 확인하세요.';end if;
 result:=rps_admin('settings',p_config,p_expected);
 if r.round=0 and p_config ? 'joinSeconds' and (p_config->>'joinSeconds')::int is distinct from r.join_seconds then
 result:=rps_admin('lobbyTime',jsonb_build_object('seconds',(p_config->>'joinSeconds')::int),(result->>'revision')::bigint);
 end if;
 return result;
end $$;
revoke all on function public.rps_update_settings(jsonb,bigint) from public,anon,authenticated;
grant execute on function public.rps_update_settings(jsonb,bigint) to service_role;
