-- [2026-11-14 09:03 사장님 「채팅량도 적게·보통·많게」] AI 채팅 쉬는 시간을 «채팅 양» 설정에 맞춤
-- 원인 실측: AI 글이 올라가면 방 전체가 4~12분(20%는 15~30분) 쉬고, 침묵 판단(skipped)도 2~4분 쉬게 해서
--   Gemini 가 말을 골라도 10분에 한 줄 정도만 나갔음.
-- 바꾸는 것(돈·주문 무접촉, 함수 3개 문장만):
--   ① AI 글 뒤 쉬는 시간: 적게 = 예전 그대로 / 보통 = 45~120초(답 30~60초) / 많게 = 15~40초(답 10~25초)
--   ② 침묵(SILENT) 판단은 쉬는 시간 안 붙임, 그 밖 실패는 적게 2~4분·보통 40~80초·많게 15~30초
--   ③ 사람 글 뒤 양보 시간: 적게 90초·보통 45초·많게 25초
-- 설정 값: settings key 'live_automation_chat_pace' = low / normal / high (없으면 normal)
-- 문장이 예상과 다르면(다른 곳에서 바뀌었으면) 전체를 멈춤(DRIFT).

create or replace function public.live_automation_chat_pace() returns text
language sql stable set search_path=pg_catalog,public as $$
 select case when v like '%low%' then 'low' when v like '%high%' then 'high' else 'normal' end
 from (select coalesce((select value::text from public.settings where key='live_automation_chat_pace'),'normal') v) s;
$$;
revoke all on function public.live_automation_chat_pace() from public,anon,authenticated;
grant execute on function public.live_automation_chat_pace() to service_role;

do $$declare original text;changed text;begin
 -- ① AI 글 뒤 쉬는 시간
 select pg_get_functiondef('public.live_automation_room_chat_rest()'::regprocedure) into original;
 changed:=replace(original,
  'delay:=case when a.kind=''reply'' then 180+floor(random()*181)::int when random()<.2 then 900+floor(random()*901)::int else 240+floor(random()*481)::int end;',
  'delay:=case public.live_automation_chat_pace()
   when ''high'' then case when a.kind=''reply'' then 10+floor(random()*16)::int else 15+floor(random()*26)::int end
   when ''normal'' then case when a.kind=''reply'' then 30+floor(random()*31)::int else 45+floor(random()*76)::int end
   else case when a.kind=''reply'' then 180+floor(random()*181)::int when random()<.2 then 900+floor(random()*901)::int else 240+floor(random()*481)::int end end;');
 if changed=original then raise exception 'ROOM_REST_DRIFT';end if;execute changed;

 -- ② 실패 뒤 쉬는 시간(침묵 판단은 제외)
 select pg_get_functiondef('public.live_automation_failed_chat_rest()'::regprocedure) into original;
 changed:=replace(original,
  'update public.live_automation_campaigns set auto_chat_after=greatest(auto_chat_after,clock_timestamp()+make_interval(secs=>120+floor(random()*121)::int)) where id=new.campaign_id;',
  'if coalesce(new.result->>''message'','''')<>''SILENT'' then
 update public.live_automation_campaigns set auto_chat_after=greatest(auto_chat_after,clock_timestamp()+make_interval(secs=>case public.live_automation_chat_pace() when ''high'' then 15+floor(random()*16)::int when ''normal'' then 40+floor(random()*41)::int else 120+floor(random()*121)::int end)) where id=new.campaign_id;
 end if;');
 if changed=original then raise exception 'FAILED_REST_DRIFT';end if;execute changed;

 -- ③ 사람 글 뒤 양보 시간
 select pg_get_functiondef('public.live_automation_ai_admission(uuid,text)'::regprocedure) into original;
 changed:=replace(original,'m.created_at>t-interval ''90 seconds''',
  'm.created_at>t-(case public.live_automation_chat_pace() when ''high'' then interval ''25 seconds'' when ''normal'' then interval ''45 seconds'' else interval ''90 seconds'' end)');
 if changed=original then raise exception 'HUMAN_YIELD_DRIFT';end if;execute changed;
end $$;

-- 지금 걸려 있는 긴 쉬는 시간은 «보통» 기준 최대 2분으로 줄임(적게면 그대로)
update public.live_automation_campaigns set auto_chat_after=least(auto_chat_after,clock_timestamp()+interval '2 minutes')
 where chat_enabled and auto_chat_after>clock_timestamp()+interval '2 minutes' and public.live_automation_chat_pace()<>'low';

-- 확인
select position('live_automation_chat_pace' in pg_get_functiondef('public.live_automation_room_chat_rest()'::regprocedure))>0 room_rest,
       position('SILENT' in pg_get_functiondef('public.live_automation_failed_chat_rest()'::regprocedure))>0 failed_rest,
       position('live_automation_chat_pace' in pg_get_functiondef('public.live_automation_ai_admission(uuid,text)'::regprocedure))>0 human_yield,
       public.live_automation_chat_pace() pace;
