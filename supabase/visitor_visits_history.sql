-- [2026-08-29] 접속 기록(날짜별 · 방송별 · 쇼핑몰모드별) 보관용 테이블
--
-- 왜 필요한가
--   현재 public.visitor_presence 는 visitor_key 가 UNIQUE 이고 upsert(onConflict: visitor_key)로
--   같은 행을 계속 덮어쓴다. 그래서 "지금 접속 중인 사람"은 알 수 있지만
--   "어제 몇 명 들어왔는지", "지난 방송에 몇 명이었는지"는 남지 않는다.
--   → 기록을 남기려면 덮어쓰지 않고 쌓이는 별도 테이블이 필요하다.
--
-- 안전
--   · 새 테이블만 만든다. 기존 테이블/데이터/로직 무변경.
--   · visitor_presence 는 그대로 두고 계속 "현재 접속자" 용도로 쓴다.
--   · 이 파일은 사장님 확인 후 Supabase SQL Editor에서 실행하십시오. (자동 실행하지 않았습니다)
--
-- 세션 정의
--   같은 visitor_key 라도 30분 이상 신호가 끊기면 새 방문으로 본다.
--   heartbeat 이 올 때 같은 세션이면 last_seen_at 만 갱신하고, 아니면 새 행을 만든다.

create table if not exists public.visitor_visits (
  id                 bigserial primary key,
  visitor_key        text        not null,
  nickname           text,
  page_type          text        not null default 'page',   -- 'order' | 'home' | 'myorder' ...
  path               text,
  broadcast_id       bigint,                                 -- 접속 시점의 진행 중 방송 (없으면 null)
  shop_mode          text        not null default 'shop',    -- 'live'(방송중) | 'shop'(쇼핑몰 모드)
  visit_date         date        not null default ((now() at time zone 'Asia/Seoul')::date),
  started_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

-- 날짜별 집계
create index if not exists visitor_visits_date_idx
  on public.visitor_visits (visit_date desc);

-- 방송별 집계
create index if not exists visitor_visits_broadcast_idx
  on public.visitor_visits (broadcast_id, started_at desc);

-- 세션 이어붙이기용 (같은 사람의 최근 방문 찾기)
create index if not exists visitor_visits_key_seen_idx
  on public.visitor_visits (visitor_key, last_seen_at desc);

alter table public.visitor_visits enable row level security;

drop policy if exists "visitor_visits_write" on public.visitor_visits;
drop policy if exists "visitor_visits_read" on public.visitor_visits;

create policy "visitor_visits_write"
on public.visitor_visits
for all
using (true)
with check (true);

create policy "visitor_visits_read"
on public.visitor_visits
for select
using (true);

-- ── 집계 예시 ───────────────────────────────────────────────────────────────
-- 날짜별 방문자 수 (최근 30일)
--   select visit_date, count(distinct visitor_key) as 방문자
--   from public.visitor_visits
--   where visit_date >= (now() at time zone 'Asia/Seoul')::date - 30
--   group by visit_date order by visit_date desc;
--
-- 방송별 방문자 수
--   select broadcast_id, count(distinct visitor_key) as 방문자, min(started_at), max(last_seen_at)
--   from public.visitor_visits
--   where broadcast_id is not null
--   group by broadcast_id order by min(started_at) desc;
--
-- 쇼핑몰 모드 vs 방송 중 비교
--   select shop_mode, count(distinct visitor_key) as 방문자, count(*) as 방문수
--   from public.visitor_visits
--   where started_at >= now() - interval '30 days'
--   group by shop_mode;
