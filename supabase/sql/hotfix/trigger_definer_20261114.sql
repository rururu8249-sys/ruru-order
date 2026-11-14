-- [2026-11-14 근본 수정] 손님(anon/authenticated) 쓰기에서 「permission denied for function」 막기
-- 원인: live_automation_% 함수 권한을 손님 역할에서 뺐는데, 손님 쓰기 때 도는 트리거/색인이 그 함수를 부름.
-- ① 색인이 쓰는 글자 정리 함수는 손님도 실행 가능(이미 실행됨, grant_name_key_20261114.sql)
grant execute on function public.live_automation_name_key(text) to public, anon, authenticated;
-- ② 트리거 함수 3개는 «만든 사람 권한»으로 돌게(본문 무변경, 누가 써도 안에서 부르는 함수 권한 문제 없음)
alter function public.live_automation_broadcast_end() security definer set search_path = public, pg_temp;
alter function public.live_automation_order_guard() security definer set search_path = public, pg_temp;
alter function public.product_brand_guard_parent_note() security definer set search_path = public, pg_temp;
