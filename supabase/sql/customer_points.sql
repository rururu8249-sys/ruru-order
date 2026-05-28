-- supabase/sql/customer_points.sql
-- 목적:
-- - 루루동이 고객 포인트 잔액/이력 테이블 설계
-- - 1차 작업에서는 기존 주문금액/결제금액/배송비/입금확인/정산 로직에 연결하지 않습니다.
-- - 실제 주문서 포인트 사용 반영은 별도 단계에서 시뮬레이션 후 진행합니다.
--
-- 운영 원칙:
-- - 고객 기준은 customer_phone을 우선 사용합니다.
-- - youtube_nickname/customer_name은 운영 확인용 보조값입니다.
-- - 포인트 변동은 반드시 ledger에 이력으로 남깁니다.
-- - balances는 현재 잔액을 빠르게 보기 위한 요약 테이블입니다.
-- - related_order_id는 orders.id 타입이 프로젝트마다 다를 수 있어 text로 둡니다.
-- - RLS는 켜되, 정책은 아직 열지 않습니다. 실제 읽기/쓰기 API 설계 후 정책을 추가합니다.

create table if not exists public.customer_point_balances (
  id uuid primary key default gen_random_uuid(),

  customer_phone text not null,
  youtube_nickname text,
  customer_name text,

  current_points integer not null default 0 check (current_points >= 0),
  total_granted_points integer not null default 0 check (total_granted_points >= 0),
  total_used_points integer not null default 0 check (total_used_points >= 0),
  total_canceled_points integer not null default 0 check (total_canceled_points >= 0),
  total_adjusted_points integer not null default 0,

  last_granted_at timestamptz,
  last_used_at timestamptz,
  last_customer_seen_at timestamptz,

  admin_memo text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_point_balances_customer_phone_unique unique (customer_phone)
);

comment on table public.customer_point_balances is
'고객별 현재 포인트 잔액 요약 테이블. 주문금액/정산 반영은 별도 단계에서 연결한다.';

comment on column public.customer_point_balances.customer_phone is
'고객 식별 기준 전화번호. 기존 customers.customer_phone과 같은 정규화 숫자 기준을 사용한다.';

comment on column public.customer_point_balances.current_points is
'현재 사용 가능 포인트 잔액. 0 미만 금지.';

create table if not exists public.customer_point_ledger (
  id uuid primary key default gen_random_uuid(),

  customer_phone text not null,
  youtube_nickname text,
  customer_name text,

  change_type text not null check (
    change_type in (
      'grant',
      'use',
      'cancel',
      'adjust',
      'expire'
    )
  ),

  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),

  reason text,
  admin_memo text,

  related_order_id text,
  related_broadcast_id text,

  customer_visible boolean not null default true,
  customer_seen_at timestamptz,

  created_by text not null default 'admin',
  created_at timestamptz not null default now(),

  constraint customer_point_ledger_customer_phone_not_empty check (length(trim(customer_phone)) >= 10)
);

comment on table public.customer_point_ledger is
'고객 포인트 지급/사용/차감/취소/만료 이력 테이블. 모든 포인트 변동은 이력으로 남긴다.';

comment on column public.customer_point_ledger.change_type is
'grant=지급, use=사용, cancel=취소/회수, adjust=관리자 조정, expire=만료';

comment on column public.customer_point_ledger.amount is
'포인트 변동 금액. 지급은 양수, 사용/차감/만료는 음수 기준으로 기록한다.';

comment on column public.customer_point_ledger.customer_visible is
'고객 화면 포인트 선물/변동 알림 표시 여부.';

comment on column public.customer_point_ledger.customer_seen_at is
'고객이 해당 포인트 알림을 확인한 시각. null이면 미확인 알림으로 볼 수 있다.';

create index if not exists idx_customer_point_balances_phone
  on public.customer_point_balances (customer_phone);

create index if not exists idx_customer_point_balances_nickname
  on public.customer_point_balances (youtube_nickname);

create index if not exists idx_customer_point_ledger_phone_created
  on public.customer_point_ledger (customer_phone, created_at desc);

create index if not exists idx_customer_point_ledger_visible_unseen
  on public.customer_point_ledger (customer_phone, customer_visible, customer_seen_at, created_at desc);

create index if not exists idx_customer_point_ledger_related_order
  on public.customer_point_ledger (related_order_id);

create or replace function public.set_customer_point_balances_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_customer_point_balances_updated_at
  on public.customer_point_balances;

create trigger trg_customer_point_balances_updated_at
before update on public.customer_point_balances
for each row
execute function public.set_customer_point_balances_updated_at();

alter table public.customer_point_balances enable row level security;
alter table public.customer_point_ledger enable row level security;

-- 정책은 의도적으로 아직 만들지 않습니다.
-- 다음 단계에서 관리자 API / 고객 조회 API를 만들 때 service role 또는 안전한 정책으로 연결합니다.
-- 지금 단계에서는 기존 주문/입금/정산 로직과 분리된 DB 설계 파일만 추가합니다.
