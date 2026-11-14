-- 2026-11-14 23:37 긴급: 손님 주문서 제출 「permission denied for function live_automation_name_key」
-- 원인: customers 표의 색인(customers_automation_name_key)이 이 함수를 쓰는데, 11/13 자동 실행 마이그레이션이
--       live_automation_* 함수 실행 권한을 anon·authenticated 에서 모두 뺐음 → 손님 화면이 회원 정보(닉네임)를 저장할 때 막힘.
-- 이 함수는 글자 정리만 하는 순수 함수(immutable)라 누구나 실행해도 안전. 클로드가 SQL Editor 에서 실행 완료.
grant execute on function public.live_automation_name_key(text) to public, anon, authenticated;
