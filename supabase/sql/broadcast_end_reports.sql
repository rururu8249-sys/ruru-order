-- ============================================================
-- 루루동이 방송종료 리포트 저장 테이블
-- 목적:
-- - 방송 종료 시점의 주문/결제 요약을 별도 테이블에 저장
-- - broadcasts / orders 원본값은 수정하지 않음
-- - 정산통계에서 나중에 방송종료 요약 리스트로 다시 보기 위한 저장소
--
-- 주의:
-- - 이 SQL은 테이블/인덱스/RLS 정책만 생성합니다.
-- - 주문금액, 입금상태, 배송비, 자동입금 연동, 정산 계산 로직은 변경하지 않습니다.
-- ============================================================

create table if not exists public.broadcast_end_reports (
  id uuid primary key default gen_random_uuid(),

  -- 방송 연결
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  broadcast_title text,
  broadcast_date date,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer not null default 0,

  -- 주문서 요약
  order_count integer not null default 0,
  active_order_count integer not null default 0,
  canceled_count integer not null default 0,

  -- 결제완료 매출
  paid_count integer not null default 0,
  paid_amount integer not null default 0,

  -- 무통장 결제완료
  bank_paid_count integer not null default 0,
  bank_paid_amount integer not null default 0,

  -- 카드 결제완료
  card_paid_count integer not null default 0,
  card_paid_amount integer not null default 0,

  -- 아직 못 받은 금액
  unpaid_count integer not null default 0,
  unpaid_amount integer not null default 0,

  -- 고객 요약
  buyer_count integer not null default 0,
  existing_member_count integer not null default 0,
  new_member_count integer not null default 0,

  -- 방문자 요약
  visitor_count integer,
  visitor_note text default '방문 로그 설정 후 표시',

  -- 저장 메모
  report_note text default '방송종료 시점 읽기 전용 요약 저장',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint broadcast_end_reports_broadcast_id_unique unique (broadcast_id),

  constraint broadcast_end_reports_non_negative_numbers check (
    duration_minutes >= 0
    and order_count >= 0
    and active_order_count >= 0
    and canceled_count >= 0
    and paid_count >= 0
    and paid_amount >= 0
    and bank_paid_count >= 0
    and bank_paid_amount >= 0
    and card_paid_count >= 0
    and card_paid_amount >= 0
    and unpaid_count >= 0
    and unpaid_amount >= 0
    and buyer_count >= 0
    and existing_member_count >= 0
    and new_member_count >= 0
  )
);

comment on table public.broadcast_end_reports is
'방송종료 시점의 주문/결제 요약 저장 테이블. 주문/입금/배송비 원본값은 수정하지 않는다.';

comment on column public.broadcast_end_reports.broadcast_id is '연결된 broadcasts.id';
comment on column public.broadcast_end_reports.paid_amount is '결제완료 매출';
comment on column public.broadcast_end_reports.unpaid_amount is '아직 못 받은 금액';
comment on column public.broadcast_end_reports.bank_paid_amount is '무통장 결제완료 금액';
comment on column public.broadcast_end_reports.card_paid_amount is '카드 결제완료 금액';
comment on column public.broadcast_end_reports.visitor_count is '방문 로그 연결 전까지 null 허용';
comment on column public.broadcast_end_reports.visitor_note is '방문자 수 관련 안내 문구';

create index if not exists broadcast_end_reports_broadcast_date_idx
  on public.broadcast_end_reports (broadcast_date desc);

create index if not exists broadcast_end_reports_ended_at_idx
  on public.broadcast_end_reports (ended_at desc);

create index if not exists broadcast_end_reports_created_at_idx
  on public.broadcast_end_reports (created_at desc);

alter table public.broadcast_end_reports enable row level security;

-- 관리자 화면은 현재 서비스키/API 또는 기존 Supabase 클라이언트 흐름에서 접근합니다.
-- 클라이언트 직접 공개 조회를 막기 위해 authenticated 기본 정책만 둡니다.
-- 실제 관리자 저장 API 연결 단계에서 서비스키를 쓰면 RLS 우회가 가능합니다.
drop policy if exists "broadcast_end_reports_authenticated_select" on public.broadcast_end_reports;
create policy "broadcast_end_reports_authenticated_select"
  on public.broadcast_end_reports
  for select
  to authenticated
  using (true);

drop policy if exists "broadcast_end_reports_authenticated_insert" on public.broadcast_end_reports;
create policy "broadcast_end_reports_authenticated_insert"
  on public.broadcast_end_reports
  for insert
  to authenticated
  with check (true);

drop policy if exists "broadcast_end_reports_authenticated_update" on public.broadcast_end_reports;
create policy "broadcast_end_reports_authenticated_update"
  on public.broadcast_end_reports
  for update
  to authenticated
  using (true)
  with check (true);

-- updated_at 자동 갱신 함수
create or replace function public.set_broadcast_end_reports_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_broadcast_end_reports_updated_at
  on public.broadcast_end_reports;

create trigger set_broadcast_end_reports_updated_at
before update on public.broadcast_end_reports
for each row
execute function public.set_broadcast_end_reports_updated_at();
