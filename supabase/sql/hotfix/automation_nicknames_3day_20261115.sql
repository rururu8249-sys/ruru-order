-- [2026-11-15 19:11 사장님 «매 방송마다 똑같은 닉네임 나오면 안 됨 · 비슷한 닉네임 삭제 · 실제 회원 닉네임과 충돌 안 되게»]
--   자동 테스트 표·함수만. 실제 손님·주문·돈 무접촉. temp table 안 씀. 다시 돌려도 안전.
--   ① 후보 최대 3,000개(새 목록 2,210개는 앱이 넣음)  ② 쓴 이름은 3일(한국 날짜) 뒤에만 다시 후보 — 이름이 모자랄 때만 1일 뒤
--   ③ 실제 회원 닉네임과 똑같거나, 끝말(맘·언니·팬…)만 다른 이름은 후보로 안 넣음  ④ 옛 후보(아직 안 쓴 것)는 지움 → 앱이 새 목록으로 다시 채움

create or replace function public.live_automation_nick_core(p text) returns text
language sql immutable parallel safe set search_path=pg_catalog as $$
 select regexp_replace(regexp_replace(lower(regexp_replace(normalize(coalesce(p,''),NFC),'[[:space:]._-]','','g')),'^(우리|mrs)',''),
   '(동생|찐팬|바라기|엄마|맘|언니|이모|여사|네|공주|댁|님|쌤|누나|팬|부인|짝꿍|여친|옆집|덕후|최애|오빠|할미|mom)$','');
$$;

create or replace function public.live_automation_pool_refill(p_candidates jsonb) returns integer
language plpgsql set search_path=pg_catalog,public as $$
declare item jsonb; k text; c text; n integer:=0; real_keys text[]; real_cores text[]; begin
 perform public.live_automation_identity_lock();
 if jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>1100 then raise exception 'INVALID_POOL'; end if;
 select array_agg(distinct public.live_automation_name_key(youtube_nickname)),
        array_agg(distinct public.live_automation_nick_core(youtube_nickname)) filter (where length(public.live_automation_nick_core(youtube_nickname))>=2)
   into real_keys,real_cores from public.customers where coalesce(trim(youtube_nickname),'')<>'';
 for item in select value from jsonb_array_elements(p_candidates) loop
   if (select count(*) from public.live_automation_nickname_pool where status='unused')>=3000 then exit; end if;
   k:=public.live_automation_name_key(item->>'nickname');
   if length(k) not between 2 and 20 or k~*'(test|admin|official|테스트)' or k~'[0-9]' then continue; end if;
   if k=any(coalesce(real_keys,'{}')) then continue; end if;
   c:=public.live_automation_nick_core(item->>'nickname');
   if length(c)>=2 and c=any(coalesce(real_cores,'{}')) then continue; end if;
   insert into public.live_automation_nickname_pool(nickname_key,nickname,category)
     values(k,trim(item->>'nickname'),coalesce(item->>'category','korean')) on conflict do nothing;
   if found then n:=n+1; end if;
 end loop;
 return n;
end $$;

-- 최근 p_days 일(한국 날짜) 안에 접속한 가상 손님 이름은 안 되돌림
create or replace function public.live_automation_pool_recycle(p_days integer default 3) returns integer
language plpgsql set search_path=pg_catalog,public as $$
declare n integer; day_start timestamptz:=(date_trunc('day',clock_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')-make_interval(days=>greatest(1,least(p_days,14))-1); begin
 perform public.live_automation_identity_lock();
 update public.live_automation_nickname_pool p set status='unused',actor_id=null,updated_at=clock_timestamp()
 where p.status='assigned'
   and p.updated_at<day_start
   and not exists(select 1 from public.live_automation_sessions s where s.actor_id=p.actor_id
       and ((s.stopped_at is null and s.leave_at>=day_start) or s.stopped_at>=day_start))
   and not exists(select 1 from public.live_automation_manual_leases l where l.actor_id=p.actor_id and l.expires_at>clock_timestamp());
 get diagnostics n=row_count;
 return n;
end $$;
drop function if exists public.live_automation_pool_recycle();

create or replace function public.live_automation_pool_assign(p_broadcast uuid,p_profile jsonb,p_target integer,p_minutes integer,p_watch boolean) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare cid uuid; candidate record; a public.live_automation_actors; x record; busy boolean; s jsonb; result jsonb; begin
 perform public.live_automation_identity_lock();
 select id into cid from public.live_automation_campaigns where broadcast_id=p_broadcast;
 if cid is null then raise exception 'NO_CAMPAIGN'; end if;
 if (select count(*) from public.live_automation_nickname_pool where status='unused')<30 then perform public.live_automation_pool_recycle(3); end if;
 if (select count(*) from public.live_automation_nickname_pool where status='unused')<30 then perform public.live_automation_pool_recycle(1); end if;
 for candidate in select n.* from public.live_automation_nickname_pool n where n.status='unused'
   and not exists(select 1 from public.customers c where public.live_automation_name_key(c.youtube_nickname)=n.nickname_key)
   and not exists(select 1 from public.live_automation_actors y where y.campaign_id=cid and y.nickname_key=n.nickname_key)
   order by random() limit 25 for update skip locked
 loop
   busy:=false;
   for x in select y.id from public.live_automation_actors y where y.nickname_key=candidate.nickname_key and y.retired_at is null loop
     if exists(select 1 from public.live_automation_sessions where actor_id=x.id and stopped_at is null and leave_at>clock_timestamp())
        or exists(select 1 from public.live_automation_manual_leases where actor_id=x.id and expires_at>clock_timestamp())
     then busy:=true; exit; end if;
   end loop;
   if busy then continue; end if;
   for x in select y.id from public.live_automation_actors y where y.nickname_key=candidate.nickname_key and y.retired_at is null loop
     perform public.live_automation_retire_actor(x.id);
   end loop;
   result:=public.live_automation_actor(p_broadcast,candidate.nickname,p_profile,p_target,p_minutes,p_watch);
   update public.live_automation_nickname_pool set status='assigned',actor_id=(result->'actor'->>'id')::uuid,updated_at=clock_timestamp() where nickname_key=candidate.nickname_key;
   return result;
 end loop;
 select y.* into a from public.live_automation_actors y where y.campaign_id=cid and y.retired_at is null
   and not exists(select 1 from public.live_automation_sessions where actor_id=y.id and stopped_at is null and leave_at>clock_timestamp())
   and not exists(select 1 from public.live_automation_manual_leases where actor_id=y.id and expires_at>clock_timestamp())
   and not exists(select 1 from public.customers c where public.live_automation_name_key(c.youtube_nickname)=y.nickname_key)
   order by random() limit 1 for update skip locked;
 if a.id is null then raise exception 'NICKNAME_POOL_EMPTY'; end if;
 s:=public.live_automation_reconnect(a.id,p_minutes,p_watch);
 return jsonb_build_object('actor',to_jsonb(a),'session',s);
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
   and proname in('live_automation_pool_refill','live_automation_pool_recycle','live_automation_pool_assign','live_automation_nick_core') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

-- 옛 후보 중 아직 안 쓴 것 지우기 — 앱이 다음 차례에 새 목록(2,210개)으로 채움
delete from public.live_automation_nickname_pool where status='unused';

select status,count(*) from public.live_automation_nickname_pool group by 1;
