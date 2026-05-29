-- supabase/sql/event_roulette_tables.sql
-- 목적:
-- - 프리즘라이브 방송용 룰렛 이벤트/당첨자 기록을 기존 주문/입금/정산/배송/포인트 로직과 분리해서 저장한다.
-- - overlay는 overlay_token으로 읽기 전용 조회만 하며, 개인정보/주문상세/전화번호/주소/포인트 지급 기능을 노출하지 않는다.
--
-- 운영 원칙:
-- - 실제 운영 모드(live)와 테스트 모드(test)를 분리한다.
-- - 미리보기(preview)는 원칙적으로 DB 저장 없이 사용하되, 필요 시 상태 표현을 위해 mode 값만 허용한다.
-- - 포인트 자동지급은 하지 않는다. 지급완료는 운영 체크 표시일 뿐이다.
-- - 기존 orders/customers/customer_point_* 테이블을 억지로 수정하지 않는다.

begin;

create table if not exists public.event_roulette_events (
  id uuid primary key default gen_random_uuid(),
  title text not null default '🎁 루루동이룰렛',
  overlay_token text not null unique,
  mode text not null default 'live' check (mode in ('live', 'test', 'preview')),
  is_test boolean not null default false,
  status text not null default 'idle' check (status in ('idle', 'spinning', 'result', 'closed')),
  event_date date,
  source_date date,
  participant_snapshot jsonb not null default '[]'::jsonb,
  winner_nickname text,
  winner_note text,
  winner_order_ids jsonb not null default '[]'::jsonb,
  spin_started_at timestamptz,
  spin_duration_ms integer not null default 5000 check (spin_duration_ms >= 1000 and spin_duration_ms <= 10000),
  result_at timestamptz,
  created_by text not null default 'admin-live',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.event_roulette_events is
  '루루동이 프리즘라이브 룰렛 이벤트 상태 저장. 주문/입금/정산/배송/포인트 로직과 분리한다.';

comment on column public.event_roulette_events.overlay_token is
  '방송 overlay 읽기전용 조회용 토큰. 관리자 기능/개인정보를 노출하지 않는다.';

comment on column public.event_roulette_events.participant_snapshot is
  '룰렛 시작 시점의 참여자 스냅샷. 닉네임/표시용 정보 중심으로 저장하고 전화번호/주소는 저장하지 않는다.';

create index if not exists event_roulette_events_overlay_token_idx
  on public.event_roulette_events (overlay_token);

create index if not exists event_roulette_events_created_at_idx
  on public.event_roulette_events (created_at desc);

create index if not exists event_roulette_events_mode_date_idx
  on public.event_roulette_events (mode, event_date, created_at desc);

create table if not exists public.event_roulette_winners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.event_roulette_events(id) on delete cascade,
  nickname text not null,
  winner_note text not null default '',
  winner_at timestamptz not null default now(),
  is_reward_done boolean not null default false,
  reward_done_at timestamptz,
  is_test boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.event_roulette_winners is
  '룰렛 당첨자 운영 체크리스트. 포인트 지급 API와 연결하지 않고 지급완료 여부만 저장한다.';

comment on column public.event_roulette_winners.is_reward_done is
  '운영자가 경품/포인트를 별도 처리했다는 체크 표시. 실제 포인트 지급 실행이 아니다.';

create index if not exists event_roulette_winners_event_id_idx
  on public.event_roulette_winners (event_id);

create index if not exists event_roulette_winners_created_at_idx
  on public.event_roulette_winners (created_at desc);

create index if not exists event_roulette_winners_is_test_idx
  on public.event_roulette_winners (is_test, created_at desc);

commit;
