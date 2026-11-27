-- [2026-11-27] 가상 손님 「닉네임 고르기」 목록(live_automation_manual_list) 느림 수정 — 클로드가 SQL Editor 에서 실행 완료
-- 원인: 방송당 가상 손님이 최대 2,038명인데 목록을 부를 때마다(창 열려 있으면 3초마다) 전원에 대해 live_automation_eligibility() 실행
--       → 평균 2.9초·최대 8초, 11/17~11/27 DB 시간의 약 11%.
-- 수정: 지금 이 방송에 들어와 있는(멈추지 않은) 가상 손님 + 오늘(한국 날짜) 주문한 가상 손님만 먼저 고른 뒤 같은 검사.
--       eligibility 의 manual=true 조건(시청 중·장바구니·오늘 주문)이 전부 이 범위 안이라 결과는 예전과 같다.
-- 되돌리기: supabase/migrations/20261113074405_live_automation_manual_identity.sql 의 live_automation_manual_list 를 다시 실행.
create or replace function public.live_automation_manual_list(p_broadcast uuid,p_operator text,p_client uuid) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
 with cand as (
   select s.actor_id as id from public.live_automation_sessions s
     join public.live_automation_campaigns c2 on c2.id=s.campaign_id
    where c2.broadcast_id=p_broadcast and s.stopped_at is null and s.leave_at>clock_timestamp()
   union
   select o.automation_actor_id from public.orders o
    where o.automation_actor_id is not null
      and o.created_at>=(date_trunc('day',clock_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'))
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'nickname',a.nickname,'activity',e.value,
   'inUse',coalesce(l.expires_at>clock_timestamp(),false),'mine',coalesce(l.expires_at>clock_timestamp() and l.operator_key=p_operator and l.client_id=p_client,false),
   'expiresAt',case when l.expires_at>clock_timestamp() then l.expires_at end) order by a.nickname),'[]'::jsonb)
 from public.live_automation_actors a join public.live_automation_campaigns c on c.id=a.campaign_id
 join cand on cand.id=a.id
 cross join lateral (select public.live_automation_eligibility(a.id) as value) e
 left join public.live_automation_manual_leases l on l.actor_id=a.id
 where c.broadcast_id=p_broadcast and (e.value->>'manual')::boolean;
$$;
