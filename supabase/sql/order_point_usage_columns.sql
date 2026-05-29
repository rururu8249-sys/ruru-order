-- supabase/sql/order_point_usage_columns.sql
-- 목적: 주문서 포인트 사용 기능을 위한 orders 컬럼 준비
-- 주의:
-- - 이 SQL은 기존 주문 금액을 재계산하지 않습니다.
-- - 기존 total_price / adjusted_total_price / final_amount 값을 변경하지 않습니다.
-- - 포인트 잔액 차감, ledger insert, 주문 저장 로직은 이 SQL에 포함하지 않습니다.
-- - 실제 주문서 포인트 사용 반영은 별도 코드 단계에서 build/시뮬레이션 후 진행합니다.

begin;

alter table public.orders
  add column if not exists point_original_amount integer not null default 0;

comment on column public.orders.point_original_amount is
  '포인트 차감 전 고객 결제 예정 금액. 기존 주문은 0 기본값 유지. 실제 적용 시 신규 주문 저장 로직에서만 기록.';

alter table public.orders
  add column if not exists point_used_amount integer not null default 0;

comment on column public.orders.point_used_amount is
  '주문서에서 사용한 포인트 금액. 1원=1포인트 기준. 기존 주문은 0 기본값 유지.';

alter table public.orders
  add column if not exists point_balance_before integer;

comment on column public.orders.point_balance_before is
  '포인트 사용 직전 고객 보유 포인트. 운영 추적용. 기존 주문 재계산 금지.';

alter table public.orders
  add column if not exists point_balance_after integer;

comment on column public.orders.point_balance_after is
  '포인트 사용 직후 고객 보유 포인트. 운영 추적용. 기존 주문 재계산 금지.';

alter table public.orders
  add column if not exists point_ledger_id uuid;

comment on column public.orders.point_ledger_id is
  '포인트 사용 차감 이력 customer_point_ledger.id 연결용. 실제 연결은 주문 저장 성공 후 별도 단계에서 처리.';

alter table public.orders
  add column if not exists point_used_at timestamptz;

comment on column public.orders.point_used_at is
  '주문서에서 포인트 사용이 확정된 시각. 기존 주문은 null 유지.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_point_original_amount_non_negative'
  ) then
    alter table public.orders
      add constraint orders_point_original_amount_non_negative
      check (point_original_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_point_used_amount_non_negative'
  ) then
    alter table public.orders
      add constraint orders_point_used_amount_non_negative
      check (point_used_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_point_balance_before_non_negative'
  ) then
    alter table public.orders
      add constraint orders_point_balance_before_non_negative
      check (point_balance_before is null or point_balance_before >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_point_balance_after_non_negative'
  ) then
    alter table public.orders
      add constraint orders_point_balance_after_non_negative
      check (point_balance_after is null or point_balance_after >= 0);
  end if;
end $$;

create index if not exists orders_point_ledger_id_idx
  on public.orders (point_ledger_id)
  where point_ledger_id is not null;

commit;
