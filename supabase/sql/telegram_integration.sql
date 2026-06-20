-- supabase/sql/telegram_integration.sql
-- 목적: 텔레그램 알림용 "봇 토큰 / 대상 chat_id" 저장.
--   봇 토큰은 비밀값이라 손님(anon)이 절대 못 읽게 RLS로 막고, 서버 API(서비스롤 키)만 읽고 쓴다.
--   (settings 테이블은 anon 읽기 가능이라 비밀값은 여기 둠 — youtube_integration 과 동일한 방식)
-- 적용: Supabase SQL Editor에 붙여넣고 Run. ADD only(기존 객체 변경 없음).

create table if not exists public.telegram_integration (
  id integer primary key default 1,
  bot_token text,
  chat_id text,
  enabled boolean default true,
  updated_at timestamptz default now(),
  constraint telegram_integration_singleton check (id = 1)
);

alter table public.telegram_integration enable row level security;

-- anon / authenticated 용 정책을 만들지 않음 = 일반 키로는 select/insert/update 전부 불가.
-- service_role 키는 RLS를 우회하므로 서버 API에서만 접근 가능.
