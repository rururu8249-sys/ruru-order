-- [2026-11-13 21:54 사장님] ① 숫자 53·75 붙은 테스트 닉네임 정리  ② 가상 시청자 평균 20~30명 유지·가끔 50명 안팎
--   자동 테스트(가상 손님) 표·함수만 건드린다. 실제 손님·주문·입금·포인트 무접촉. temp table 안 씀.

-- ───────── ⓪ 지금 상태 보기 (아무것도 안 바뀜) ─────────
select
  (select count(*) from public.live_automation_nickname_pool where status='unused') as 남은_닉네임_후보,
  (select count(*) from public.live_automation_sessions where watching and stopped_at is null and leave_at>now()) as 지금_가상_시청자,
  (select count(*) from public.live_automation_actors a where a.retired_at is null and a.nickname ~ '[0-9]') as 숫자붙은_테스트닉네임,
  (select population_plan::text from public.live_automation_campaigns where viewers_enabled order by updated_at desc limit 1) as 시청자_계획;

-- ───────── ① 숫자 붙은 테스트 닉네임(양말한짝수배53 등) 내보내기 ─────────
--   [22:00 사장님 «숫자 빼고»] 숫자가 들어간 가상 손님 닉네임 전부(별빛찻잔75·달빛27 등). 실제 손님은 대상 아님. 채팅·주문 기록은 그대로 남고, 접속 목록·닉네임 고르기에서 빠진다.
do $$
declare a record; n integer:=0; begin
 perform public.live_automation_identity_lock();
 for a in
   select x.id from public.live_automation_actors x
   where x.retired_at is null and x.nickname ~ '[0-9]'
 loop
   update public.live_automation_actors set retired_at=clock_timestamp() where id=a.id;
   update public.live_automation_sessions set stopped_at=clock_timestamp(),watching=false where actor_id=a.id and stopped_at is null;
   delete from public.visitor_presence where automation_session_id in(select id from public.live_automation_sessions where actor_id=a.id);
   delete from public.live_automation_cart_holds where session_id in(select id from public.live_automation_sessions where actor_id=a.id);
   update public.live_automation_actions set status='cancelled',lease_token=null,completed_at=clock_timestamp() where actor_id=a.id and status in('pending','claimed','uncertain');
   update public.live_automation_manual_leases set expires_at=clock_timestamp() where actor_id=a.id;
   n:=n+1;
 end loop;
 delete from public.live_automation_nickname_pool p where p.status='unused' and p.nickname ~ '[0-9]';
 raise notice '숫자 붙은 테스트 닉네임 % 개 내보냄', n;
end $$;

-- ───────── ② 가상 시청자 수: 평소 20~30명, 잠깐 줄어도 17~21명, 가끔 46~50명(6~9분) ─────────
--   예전: 평소 2~30명을 2~5분마다 새로 뽑음(평균 16)·가끔 2~10명까지 내려감·50명 구간이 2~3분이라 올라가는 도중에 끝나 50을 못 봄.
do $$declare def text; begin
 select pg_get_functiondef('public.live_automation_population_step(uuid,bigint,jsonb)'::regprocedure) into def;
 if position('20+floor(random()*11)::int' in def)>0 then raise notice '이미 적용됨 — 건너뜀'; return; end if;
 if position('''target'',16,' in def)=0 or position('2+floor(random()*29)::int' in def)=0 or position('2+floor(random()*9)::int' in def)=0
    or position('42+floor(random()*9)::int' in def)=0 or position('secs=>120+floor(random()*61)::int),''nextSpike''' in def)=0
 then raise exception 'VIEWER_TARGET_PATCH_DRIFT — 함수 모양이 달라 중단(아무것도 안 바뀜)'; end if;
 def:=replace(def,'''target'',16,','''target'',24,');
 def:=replace(def,'2+floor(random()*29)::int','20+floor(random()*11)::int');
 def:=replace(def,'2+floor(random()*9)::int','17+floor(random()*5)::int');
 def:=replace(def,'42+floor(random()*9)::int','46+floor(random()*5)::int');
 def:=replace(def,'secs=>120+floor(random()*61)::int),''nextSpike''','secs=>360+floor(random()*181)::int),''nextSpike''');
 execute def;
end $$;
-- 새 숫자가 바로 적용되게 진행 중이던 계획만 비움(다음 30초 차례에 24명 기준으로 다시 시작)
update public.live_automation_campaigns set population_plan=null where viewers_enabled;
