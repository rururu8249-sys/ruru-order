-- supabase/sql/youtube_integration.sql
-- 목적: 유튜브 라이브 채팅 자동 알림용 "접속 열쇠(refresh token)" 저장.
--   refresh token은 비밀값이라 손님(anon)이 절대 못 읽게 RLS로 막고,
--   서버 API(서비스롤 키)만 읽고 쓴다. (settings 테이블은 anon 읽기 가능이라 여기엔 안 둠)
-- ON/OFF·문구·라이브URL 같은 비밀 아닌 설정은 기존 settings 테이블에 둔다(youtube_* 키).
-- 적용: Supabase SQL Editor에 붙여넣고 Run. ADD only(기존 객체 변경 없음).

create table if not exists public.youtube_integration (
  id integer primary key default 1,
  refresh_token text,
  updated_at timestamptz default now(),
  constraint youtube_integration_singleton check (id = 1)
);

alter table public.youtube_integration enable row level security;

-- anon / authenticated 용 정책을 만들지 않음 = 일반 키로는 select/insert/update 전부 불가.
-- service_role 키는 RLS를 우회하므로 서버 API에서만 접근 가능.
