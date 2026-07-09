-- ============================================================
-- 서바이벌(생존게임) 이벤트 — 다중 생존자 저장용 컬럼 추가
-- 위치: supabase/sql/event_survival_columns.sql
--
-- 목적:
--   기존 룰렛/인형뽑기는 "이벤트 1개 = 당첨자 1명"(winner_nickname 단일 문자열) 구조.
--   서바이벌은 한 판에 생존자(당첨자) K명이 나오므로 그 명단을 저장할 칸이 필요함.
--
-- 안전성:
--   * ADD COLUMN only (기존 컬럼/데이터/제약 변경 없음, 삭제 없음)
--   * 기존 룰렛/인형뽑기 코드는 이 컬럼을 읽지도 쓰지도 않음 → 영향 0
--   * 돈/입금/정산/포인트 로직과 무관 (이벤트 결과 표시·지급 대상 명단 저장용)
--   * 실행 전이면 서바이벌만 동작 안 함. 룰렛/인형뽑기/미션은 정상.
--
-- 실행 방법: Supabase → SQL Editor 에 붙여넣고 실행 (1회)
-- ============================================================

-- 최종 생존자(당첨자) 닉네임 목록. 예: ["꽃님맘","행복이","단비님"]
alter table public.event_roulette_events
  add column if not exists survivor_nicknames jsonb not null default '[]'::jsonb;

-- 그 판에서 뽑기로 한 생존자 수 K (기록용)
alter table public.event_roulette_events
  add column if not exists winner_count integer not null default 1;

-- 확인용 (실행 후 컬럼이 생겼는지)
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'event_roulette_events'
--    and column_name in ('survivor_nicknames','winner_count');
