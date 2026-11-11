-- All private writes are service-role RPCs. Public clients see only the projection.
create table public.rps_rooms (
 id uuid primary key default gen_random_uuid(), event_id uuid references public.event_roulette_events(id), broadcast_id uuid,
 title text not null default '가위·바위·보 루루를 이겨라!', status text not null default 'lobby'
 check(status in ('lobby','ready','choosing','reveal','paused','finished','closed')),
 revision bigint not null default 1, round integer not null default 0, deadline timestamptz,
 join_seconds int not null default 300 check(join_seconds between 10 and 1800), pick_seconds int not null default 5 check(pick_seconds between 3 and 30),
 target int not null default 1 check(target between 1 and 1000), automatic boolean not null default true, pvp boolean not null default false,
 is_test boolean not null default false, reward_kind text not null default 'points' check(reward_kind in ('points','gift','none')),
 points int not null default 1000 check(points between 0 and 100000), gift text not null default '' check(length(gift)<=40),
 check(reward_kind<>'gift' or length(trim(gift))>0), check(reward_kind<>'points' or points>0),
 host_hand text, salt text, commitment text, previous_status text, remaining_ms int,
 stats jsonb not null default '{}', note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index rps_one_open_room on public.rps_rooms((true)) where status<>'closed';
create table public.rps_players (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rps_rooms(id),
 kakao_id text not null, customer_id bigint not null, verified_phone text not null default '', nickname text not null,
 alive boolean not null default true, winner boolean not null default false, choice text check(choice in ('scissors','rock','paper')),
 choice_round int not null default 0, result text, winner_id uuid references public.event_roulette_winners(id),
 reward_status text not null default 'pending', reward_message text not null default '', reward_retry_at timestamptz,
 joined_at timestamptz not null default now(), unique(room_id,kakao_id)
);
create unique index rps_unique_phone on public.rps_players(room_id,verified_phone) where verified_phone<>'';
create index rps_players_room_alive on public.rps_players(room_id,alive);
create index rps_players_pending on public.rps_players(room_id,reward_status) where winner;
create table public.rps_rounds(room_id uuid references public.rps_rooms(id), round int, commitment text not null, host_hand text, salt text, opened_at timestamptz not null default now(), revealed_at timestamptz, primary key(room_id,round));
create table public.rps_public(id int primary key check(id=1),payload jsonb not null default '{}');
insert into public.rps_public(id) values(1);
alter table public.rps_rooms enable row level security;
alter table public.rps_players enable row level security;
alter table public.rps_rounds enable row level security;
alter table public.rps_public enable row level security;
revoke all on public.rps_rooms,public.rps_players,public.rps_rounds,public.rps_public from anon,authenticated;
grant all on public.rps_rooms,public.rps_players,public.rps_rounds,public.rps_public to service_role;
grant select on public.rps_public to anon,authenticated;
create policy rps_public_read on public.rps_public for select to anon,authenticated using(true);

create or replace function public.rps_publish(p_id uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r rps_rooms%rowtype; v jsonb; old jsonb; n int; a int; finals jsonb; winners jsonb;
begin
 select * into r from rps_rooms where id=p_id;
 select count(*),count(*) filter(where alive and not winner) into n,a from rps_players where room_id=p_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'nickname',nickname) order by joined_at,id),'[]') into winners from rps_players where room_id=p_id and winner;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'hand',case when r.status in ('reveal','finished') then choice end,'result',case when r.status in ('reveal','finished') then result end) order by joined_at,id),'[]') into finals from rps_players where room_id=p_id and n<=4;
 -- Later small finals include remaining players, never the whole original roster.
 if n>4 and a<=4 then
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'hand',case when r.status in ('reveal','finished') then choice end,'result',case when r.status in ('reveal','finished') then result end) order by joined_at,id),'[]') into finals from rps_players where room_id=p_id and alive and not winner;
 end if;
 v:=jsonb_build_object('id',r.id,'broadcastId',r.broadcast_id,'title',r.title,'status',r.status,'revision',r.revision,'round',r.round,
 'deadline',r.deadline,'joinSeconds',r.join_seconds,'pickSeconds',case when r.round=1 then 8 else r.pick_seconds end,
 'target',r.target,'auto',r.automatic,'pvp',r.pvp,'test',r.is_test,'rewardKind',r.reward_kind,'points',r.points,'gift',r.gift,
 'total',n,'alive',a,'winners',winners,'finals',finals,'commitment',r.commitment,
 'hostHand',case when r.status in ('reveal','finished') then r.host_hand end,'salt',case when r.status in ('reveal','finished') then r.salt end,
 'stats',case when r.status in ('reveal','finished') then r.stats else '{}'::jsonb end,'note',r.note);
 select payload-'serverTime' into old from rps_public where id=1;
 if old is distinct from v then
 v:=v||jsonb_build_object('serverTime',clock_timestamp());
 update rps_public set payload=v where id=1;
 -- Notification is only an invalidation: browsers fetch the authoritative projection.
 perform realtime.send(jsonb_build_object('changed',true),'changed','ruru-rps',false);
 end if;
 return v;
end $$;

create or replace function public.rps_open_round(p_id uuid,p_hand text default null) returns void language plpgsql security invoker set search_path=public as $$
declare r rps_rooms%rowtype; h text; salt_value text; b int;
begin
 select * into r from rps_rooms where id=p_id for update;
 if r.status not in ('ready','lobby','reveal') then raise exception '지금은 라운드를 시작할 수 없어요.';end if;
 if not exists(select 1 from rps_players where room_id=p_id and alive and not winner) then raise exception '참가자가 없어요.';end if;
 h:=p_hand;
 if r.pvp then h:='pvp';
 elsif r.automatic then
 loop b:=get_byte(decode(replace(gen_random_uuid()::text,'-',''),'hex'),0);exit when b<252;end loop;
 h:=(array['scissors','rock','paper'])[1+b%3];
 elsif h is null or h not in ('scissors','rock','paper') then raise exception '루루의 손을 먼저 선택하세요.';end if;
 salt_value:=gen_random_uuid()::text||gen_random_uuid()::text;
 update rps_rooms set status='choosing',round=round+1,host_hand=h,salt=salt_value,
 commitment=encode(sha256(convert_to(id::text||':'||(round+1)::text||':'||h||':'||salt_value,'UTF8')),'hex'),
 deadline=clock_timestamp()+make_interval(secs=>case when round=0 then 8 else pick_seconds end),note='',stats='{}',revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into r;
 insert into rps_rounds(room_id,round,commitment) values(r.id,r.round,r.commitment);
end $$;

create or replace function public.rps_join(p_room uuid,p_kakao text,p_phone text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r rps_rooms%rowtype; c customers%rowtype; p rps_players%rowtype;
begin
 select * into r from rps_rooms where id=p_room for update;
 select * into p from rps_players where room_id=p_room and kakao_id=p_kakao;
 if found then
 if p.verified_phone='' and coalesce(p_phone,'')<>'' then update rps_players set verified_phone=p_phone where id=p.id;end if;
 return jsonb_build_object('ok',true,'id',p.id);end if;
 if r.id is null or r.status<>'lobby' or clock_timestamp()>=r.deadline then raise exception '참가 모집이 마감됐어요.';end if;
 if (select count(*) from rps_players where room_id=p_room)>=1000 then raise exception '참가 정원 1,000명이 찼어요.';end if;
 select * into c from customers where kakao_id=p_kakao order by created_at desc,id desc limit 1;
 if c.id is null or nullif(trim(c.youtube_nickname),'') is null then raise exception '내정보에서 닉네임을 먼저 등록해 주세요.';end if;
 if lower(coalesce(c.is_blocked,'')) in ('true','1','y','yes') then raise exception '참가할 수 없는 계정입니다.';end if;
 if coalesce(p_phone,'')<>'' and exists(select 1 from rps_players where room_id=p_room and verified_phone=p_phone) then raise exception '같은 본인 확인 번호로 이미 참가했어요.';end if;
 insert into rps_players(room_id,kakao_id,customer_id,verified_phone,nickname) values(p_room,p_kakao,c.id,coalesce(p_phone,''),left(trim(c.youtube_nickname),40)) returning * into p;
 return jsonb_build_object('ok',true,'id',p.id);
end $$;

create or replace function public.rps_pick(p_room uuid,p_kakao text,p_round int,p_hand text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r rps_rooms%rowtype;
begin
 -- SHARE permits independent player writes, while result settlement takes UPDATE.
 select * into r from rps_rooms where id=p_room for share;
 if r.id is null or r.status<>'choosing' or clock_timestamp()>=r.deadline then raise exception '선택이 마감됐어요.';end if;
 if p_round<>r.round then raise exception '지난 라운드의 선택입니다.';end if;
 if p_hand is null or p_hand not in ('scissors','rock','paper') then raise exception '가위·바위·보 중 선택하세요.';end if;
 update rps_players set choice=p_hand,choice_round=p_round where room_id=p_room and kakao_id=p_kakao and alive and not winner;
 if not found then raise exception '이번 라운드 참가자가 아닙니다.';end if;
 return jsonb_build_object('ok',true,'hand',p_hand,'round',p_round);
end $$;

create or replace function public.rps_settle(p_id uuid) returns void language plpgsql security invoker set search_path=public as $$
declare r rps_rooms%rowtype; a int; slots int; w int; hands text[]; winning text; stats_value jsonb;
begin
 select * into r from rps_rooms where id=p_id for update;
 if r.status<>'choosing' or clock_timestamp()<r.deadline then return;end if;
 if r.pvp then
 select array_agg(distinct choice) into hands from rps_players where room_id=p_id and alive and not winner and choice_round=r.round;
 if cardinality(hands)=2 then
 winning:=case when hands @> array['rock','scissors'] then 'rock' when hands @> array['paper','rock'] then 'paper' else 'scissors' end;
 end if;
 end if;
 update rps_players set result=case
 when choice_round<>r.round or choice is null then 'forfeit'
 when r.pvp and winning is null then 'draw'
 when r.pvp then case when choice=winning then 'win' else 'lose' end
 when choice=r.host_hand then 'draw'
 when (choice='rock' and r.host_hand='scissors') or (choice='paper' and r.host_hand='rock') or (choice='scissors' and r.host_hand='paper') then 'win'
 else 'lose' end where room_id=p_id and alive and not winner;
 select jsonb_build_object('win',count(*) filter(where result='win'),'draw',count(*) filter(where result='draw'),'lose',count(*) filter(where result='lose'),'forfeit',count(*) filter(where result='forfeit'),
 'rock',count(*) filter(where choice_round=r.round and choice='rock'),'paper',count(*) filter(where choice_round=r.round and choice='paper'),'scissors',count(*) filter(where choice_round=r.round and choice='scissors')) into stats_value from rps_players where room_id=p_id and alive and not winner;
 update rps_players set alive=false where room_id=p_id and alive and not winner and result in ('lose','forfeit');
 select count(*) into w from rps_players where room_id=p_id and winner;slots:=r.target-w;
 select count(*) into a from rps_players where room_id=p_id and alive and not winner;
 if a<=slots then
 update rps_players set winner=true,alive=false where room_id=p_id and alive and not winner;
 if a<slots then
 -- Only this round's losing submissions return. Never restore missed selections.
 update rps_players set alive=true where room_id=p_id and not winner and choice_round=r.round and result='lose';
 end if;
 end if;
 select count(*) into a from rps_players where room_id=p_id and alive and not winner;
 update rps_rounds set host_hand=r.host_hand,salt=r.salt,revealed_at=clock_timestamp() where room_id=p_id and round=r.round;
 update rps_rooms set status=case when a=0 then 'finished' else 'reveal' end,stats=stats_value,
 deadline=case when a=0 then null else clock_timestamp()+make_interval(secs=>case when (stats_value->>'lose')::int=0 and (stats_value->>'forfeit')::int=0 then 1 else 2 end) end,
 note=case when a=0 then '게임 종료' when (stats_value->>'win')::int+(stats_value->>'draw')::int=0 then '전원 패배! 선택한 분들끼리 다시 한 판' when slots>(stats_value->>'win')::int+(stats_value->>'draw')::int then '일부 당첨 확정 · 남은 자리 재대결' else '' end,
 revision=revision+1,updated_at=clock_timestamp() where id=p_id;
end $$;

create or replace function public.rps_reward(p_id uuid) returns void language plpgsql security invoker set search_path=public as $$
declare r rps_rooms%rowtype; p rps_players%rowtype; c customers%rowtype; answer jsonb; wid uuid;
begin
 select * into r from rps_rooms where id=p_id;
 if r.status not in ('finished','closed') then return;end if;
 for p in select * from rps_players where room_id=p_id and winner and reward_status='pending' and (reward_retry_at is null or reward_retry_at<clock_timestamp()) order by joined_at,id limit 20 for update skip locked loop
 begin
 if p.winner_id is null then
 insert into event_roulette_winners(event_id,nickname,winner_note,winner_at,is_test,memo)
 values(r.event_id,p.nickname,case when r.reward_kind='points' then r.points::text||'P' else r.gift end,clock_timestamp(),r.is_test,'가위·바위·보') returning id into wid;
 update rps_players set winner_id=wid where id=p.id;p.winner_id:=wid;
 end if;
 if r.is_test or r.reward_kind='none' then
 update rps_players set reward_status=case when r.is_test then 'test' else 'done' end,reward_message='' where id=p.id;
 elsif r.reward_kind='points' then
 if length(p.verified_phone)<10 then
 update rps_players set reward_status='needs_info',reward_message='카카오 본인 확인 전화번호 필요' where id=p.id;
 else
 select * into c from customers where id=p.customer_id;
 answer:=public.admin_change_customer_points(p.verified_phone,'grant',r.points,r.title,'가위·바위·보 자동 지급',p.nickname,c.customer_name,true,'event_winner:'||p.winner_id::text);
 if coalesce((answer->>'ok')::boolean,false) then
 update rps_players set reward_status='done',reward_message='' where id=p.id;
 update event_roulette_winners set is_reward_done=true,reward_done_at=clock_timestamp() where id=p.winner_id;
 else raise exception '포인트 지급 확인 필요';end if;
 end if;
 else
 answer:=public.rps_gift(p.id);
 update rps_players set reward_status=case when coalesce((answer->>'ok')::boolean,false) then 'done' else 'needs_info' end,reward_message=coalesce(answer->>'message','') where id=p.id;
 end if;
 exception when others then
 update rps_players set reward_message='지급 재시도 대기',reward_retry_at=clock_timestamp()+interval '30 seconds' where id=p.id;
 end;
 end loop;
 update event_roulette_events set status='result',result_at=coalesce(result_at,clock_timestamp()),updated_at=clock_timestamp(),winner_nickname=(select string_agg(nickname,', ' order by joined_at) from rps_players where room_id=p_id and winner) where id=r.event_id;
end $$;

create or replace function public.rps_tick() returns void language plpgsql security invoker set search_path=public as $$
declare r rps_rooms%rowtype; archived uuid;
begin
 -- One clock runner, even if an administrator and pg_cron tick simultaneously.
 if not pg_try_advisory_xact_lock(84266710) then return;end if;
 select id into archived from rps_rooms where status='closed' and exists(select 1 from rps_players p where p.room_id=rps_rooms.id and p.winner and p.reward_status='pending' and (p.reward_retry_at is null or p.reward_retry_at<clock_timestamp())) order by updated_at limit 1;
 if archived is not null then perform rps_reward(archived);end if;
 select * into r from rps_rooms where status<>'closed' limit 1 for update;
 if r.id is null then return;end if;
 if r.status='lobby' and clock_timestamp()>=r.deadline then
 if not exists(select 1 from rps_players where room_id=r.id) then
 update rps_rooms set status='ready',deadline=null,note='참가자가 없어 모집을 다시 열어 주세요.',revision=revision+1 where id=r.id;
 elsif r.automatic then perform rps_open_round(r.id);
 else update rps_rooms set status='ready',deadline=null,revision=revision+1 where id=r.id;end if;
 elsif r.status='choosing' then perform rps_settle(r.id);
 elsif r.status='reveal' and clock_timestamp()>=r.deadline then
 if r.automatic or r.pvp then perform rps_open_round(r.id);
 else update rps_rooms set status='ready',deadline=null,revision=revision+1 where id=r.id;end if;
 end if;
 perform rps_reward(r.id);
 perform rps_publish(r.id);
end $$;

create or replace function public.rps_admin(p_action text,p_data jsonb,p_expected bigint) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r rps_rooms%rowtype; v_id uuid; e_id uuid; n int;
begin
 perform pg_advisory_xact_lock(84266710);
 select * into r from rps_rooms where status<>'closed' limit 1 for update;
 if p_action='create' then
 if r.id is not null then raise exception '진행 중인 게임을 먼저 종료하세요.';end if;
 insert into event_roulette_events(title,overlay_token,mode,is_test,status,broadcast_id,custom_gift_name,winner_count,created_by)
 values('가위·바위·보 루루를 이겨라!','rps_'||gen_random_uuid()::text,case when coalesce((p_data->>'test')::boolean,false) then 'test' else 'live' end,coalesce((p_data->>'test')::boolean,false),'idle',p_data->>'broadcastId',case when p_data->>'rewardKind'='gift' then nullif(p_data->>'gift','') end,coalesce((p_data->>'winners')::int,1),'rps') returning id into e_id;
 insert into rps_rooms(event_id,broadcast_id,is_test,title,target,automatic,join_seconds,pick_seconds,reward_kind,points,gift,deadline)
 values(e_id,nullif(p_data->>'broadcastId','')::uuid,coalesce((p_data->>'test')::boolean,false),coalesce(nullif(left(trim(p_data->>'title'),80),''),'가위·바위·보 루루를 이겨라!'),coalesce((p_data->>'winners')::int,1),coalesce((p_data->>'auto')::boolean,true),coalesce((p_data->>'joinSeconds')::int,300),coalesce((p_data->>'pickSeconds')::int,5),coalesce(p_data->>'rewardKind','points'),coalesce((p_data->>'points')::int,1000),coalesce(p_data->>'gift',''),clock_timestamp()+make_interval(secs=>coalesce((p_data->>'joinSeconds')::int,300))) returning id into v_id;
 return rps_publish(v_id);
 end if;
 if p_action='retry' and nullif(p_data->>'roomId','') is not null then select * into r from rps_rooms where id=(p_data->>'roomId')::uuid for update;end if;
 if r.id is null then raise exception '게임이 없습니다.';end if;
 if r.revision<>p_expected then raise exception '다른 관리자가 변경했어요. 새 상태를 확인해 주세요.';end if;
 if p_action='close' then
 update rps_rooms set status='closed',deadline=null,revision=revision+1 where id=r.id;
 update rps_players set alive=false where room_id=r.id and not winner;
 perform rps_reward(r.id);
 elsif p_action in ('start','next') then
 if r.status not in ('lobby','ready') then raise exception '다음 라운드 대기 중에만 시작할 수 있어요.';end if;
 perform rps_open_round(r.id,p_data->>'hand');
 elsif p_action='lobbyTime' then
 if r.status<>'lobby' and not (r.status='ready' and r.round=0) then raise exception '모집 중에만 변경할 수 있어요.';end if;
 n:=(p_data->>'seconds')::int;if n is null or n<10 or n>1800 then raise exception '모집 시간은 10~1800초입니다.';end if;
 update rps_rooms set status='lobby',join_seconds=n,deadline=clock_timestamp()+make_interval(secs=>n),revision=revision+1 where id=r.id;
 elsif p_action='pause' then
 if r.status not in ('lobby','choosing','reveal') then raise exception '지금은 일시정지할 수 없어요.';end if;
 if clock_timestamp()>=r.deadline then raise exception '시간이 마감됐어요. 결과를 기다려 주세요.';end if;
 update rps_rooms set previous_status=status,remaining_ms=greatest(1,ceil(extract(epoch from(deadline-clock_timestamp()))*1000)::int),status='paused',deadline=null,revision=revision+1 where id=r.id;
 elsif p_action='resume' then
 if r.status<>'paused' then raise exception '일시정지 중이 아닙니다.';end if;
 update rps_rooms set status=previous_status,deadline=clock_timestamp()+remaining_ms*interval '1 millisecond',revision=revision+1 where id=r.id;
 elsif p_action='settings' then
 if r.status not in ('lobby','ready') then raise exception '모집 또는 라운드 대기 중에 변경하세요.';end if;
 if r.round>0 and (p_data ? 'winners' or p_data ? 'rewardKind' or p_data ? 'points' or p_data ? 'gift') then raise exception '시작 후 당첨 인원과 선물은 변경할 수 없어요.';end if;
 update rps_rooms set title=coalesce(nullif(left(trim(p_data->>'title'),80),''),title),automatic=coalesce((p_data->>'auto')::boolean,automatic),pick_seconds=coalesce((p_data->>'pickSeconds')::int,pick_seconds),target=coalesce((p_data->>'winners')::int,target),reward_kind=coalesce(p_data->>'rewardKind',reward_kind),points=coalesce((p_data->>'points')::int,points),gift=coalesce(p_data->>'gift',gift),revision=revision+1 where id=r.id;
 elsif p_action='pvp' then
 select count(*) into n from rps_players where room_id=r.id and alive and not winner;
 if r.status not in ('ready','reveal') or n<2 or n>4 then raise exception '2~4명 생존, 라운드 대기 중에만 결승 전환할 수 있어요.';end if;
 update rps_rooms set pvp=true,revision=revision+1 where id=r.id;
 elsif p_action='retry' then
 if r.status not in ('finished','closed') then raise exception '게임 종료 후 재시도하세요.';end if;
 update rps_players set reward_status='pending',reward_retry_at=null where room_id=r.id and winner and reward_status in ('pending','needs_info');perform rps_reward(r.id);
 else raise exception '지원하지 않는 게임 명령입니다.';end if;
 update event_roulette_events set title=r2.title,custom_gift_name=case when r2.reward_kind='gift' then r2.gift end,winner_count=r2.target from rps_rooms r2 where event_roulette_events.id=r2.event_id and r2.id=r.id;
 if p_action='retry' and r.status='closed' then return (select payload from rps_public where id=1);end if;
 return rps_publish(r.id);
end $$;

-- No caller can execute these functions through the public API without the service role.
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('rps_publish','rps_open_round','rps_join','rps_pick','rps_settle','rps_reward','rps_tick','rps_admin') loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated';execute 'grant execute on function '||f.signature||' to service_role';end loop;end $$;
-- HOSTED CLOCK is installed in the follow-up migration after the reward function.
