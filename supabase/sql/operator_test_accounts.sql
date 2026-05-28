-- supabase/sql/operator_test_accounts.sql
-- 목적:
-- - 운영자/관리자 테스트 계정을 전화번호 기준으로 지정합니다.
-- - 테스트 계정은 포인트 테스트, 금액 테스트, 주문서 테스트를 실제 운영 데이터와 분리하기 위한 기준입니다.
-- - 이 단계에서는 주문/정산/입금/송장 제외 로직에 아직 연결하지 않습니다.

create table if not exists public.operator_test_accounts (
  id uuid primary key default gen_random_uuid(),

  customer_phone text not null,
  display_label text not null default '관리자',

  is_active boolean not null default true,

  allow_point_test boolean not null default true,
  allow_amount_test boolean not null default true,

  exclude_from_settlement boolean not null default true,
  exclude_from_payment_match boolean not null default true,
  exclude_from_shipping boolean not null default true,
  exclude_from_picking boolean not null default true,

  admin_memo text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operator_test_accounts_customer_phone_unique unique (customer_phone),
  constraint operator_test_accounts_customer_phone_not_empty check (length(trim(customer_phone)) >= 10)
);

comment on table public.operator_test_accounts is
'운영자/관리자 테스트 계정 목록. 전화번호 기준으로 테스트 주문/포인트/금액 테스트를 실제 정산에서 분리하기 위한 기준 테이블.';

comment on column public.operator_test_accounts.customer_phone is
'숫자만 남긴 고객 전화번호. 예: 01081912420';

comment on column public.operator_test_accounts.display_label is
'고객 화면 최상단에 표시할 짧은 배지 문구. 기본값: 관리자';

comment on column public.operator_test_accounts.exclude_from_settlement is
'다음 단계에서 테스트 주문 정산 제외 기준으로 사용할 예정. 현재 단계에서는 주문/정산 로직에 연결하지 않음.';

create index if not exists idx_operator_test_accounts_phone_active
  on public.operator_test_accounts (customer_phone, is_active);

create or replace function public.set_operator_test_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_operator_test_accounts_updated_at
  on public.operator_test_accounts;

create trigger trg_operator_test_accounts_updated_at
before update on public.operator_test_accounts
for each row
execute function public.set_operator_test_accounts_updated_at();

alter table public.operator_test_accounts enable row level security;

-- 공개 정책은 만들지 않습니다.
-- 고객 화면에서는 /api/customer-test-account API가 service role로 조회합니다.

insert into public.operator_test_accounts (
  customer_phone,
  display_label,
  is_active,
  allow_point_test,
  allow_amount_test,
  exclude_from_settlement,
  exclude_from_payment_match,
  exclude_from_shipping,
  exclude_from_picking,
  admin_memo
)
values
  (
    '01099992420',
    '관리자',
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    '금액테스트/포인트테스트 운영자 테스트 계정'
  ),
  (
    '01081912420',
    '관리자',
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    '금액테스트/포인트테스트 운영자 테스트 계정'
  )
on conflict (customer_phone)
do update set
  display_label = excluded.display_label,
  is_active = true,
  allow_point_test = true,
  allow_amount_test = true,
  exclude_from_settlement = true,
  exclude_from_payment_match = true,
  exclude_from_shipping = true,
  exclude_from_picking = true,
  admin_memo = excluded.admin_memo,
  updated_at = now();

select
  customer_phone,
  display_label,
  is_active,
  allow_point_test,
  allow_amount_test,
  exclude_from_settlement,
  exclude_from_payment_match,
  exclude_from_shipping,
  exclude_from_picking,
  admin_memo,
  updated_at
from public.operator_test_accounts
where customer_phone in ('01099992420', '01081912420')
order by customer_phone;
