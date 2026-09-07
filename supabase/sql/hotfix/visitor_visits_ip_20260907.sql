-- supabase/sql/hotfix/visitor_visits_ip_20260907.sql
-- [2026-09-07 사장님 요청] 접속 방문자 IP 저장 — "같은 IP = 같은 사람일 가능성" 구분용(비회원/장난 다계정 파악 보조).
--   ADD COLUMN only (기존 데이터 무변경). 접속 표(visitor_visits)만 건드림 — 주문/입금/정산/배송/포인트 무관.
--   ⚠️ 실행 전에도 접속 기록은 정상 저장됨(코드가 "칸 없음"이면 IP만 빼고 저장). 실행하면 그때부터 IP가 채워짐.
--   적용: Supabase SQL Editor 에 붙여넣고 Run.
alter table public.visitor_visits add column if not exists ip text;
comment on column public.visitor_visits.ip is '방문자 접속 IP(x-forwarded-for 첫 주소, 표시/구분용)';
