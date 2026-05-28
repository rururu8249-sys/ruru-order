-- supabase/sql/order_test_flags.sql
-- 목적:
-- - 운영자 테스트 계정이 주문서를 제출했을 때 orders 행에 테스트 주문 여부를 저장할 컬럼을 추가합니다.
-- - 이 단계에서는 DB 컬럼만 추가합니다.
-- - 주문 저장 로직, 정산 제외, Bankda/입금확인 제외, 송장/피킹 제외는 아직 연결하지 않습니다.
--
-- 운영 원칙:
-- - 기존 주문은 모두 일반 주문으로 유지합니다.
-- - is_test_order 기본값은 false입니다.
-- - exclude_* 컬럼은 다음 단계에서 테스트 주문 제외 기준으로 사용합니다.
-- - 돈/정산/입금/배송 로직은 별도 단계에서 시뮬레이션 후 연결합니다.

alter table public.orders
  add column if not exists is_test_order boolean not null default false;

alter table public.orders
  add column if not exists test_order_reason text;

alter table public.orders
  add column if not exists operator_test_phone text;

alter table public.orders
  add column if not exists exclude_from_settlement boolean not null default false;

alter table public.orders
  add column if not exists exclude_from_payment_match boolean not null default false;

alter table public.orders
  add column if not exists exclude_from_shipping boolean not null default false;

alter table public.orders
  add column if not exists exclude_from_picking boolean not null default false;

comment on column public.orders.is_test_order is
'운영자/관리자 테스트 계정이 제출한 테스트 주문 여부. 기본값 false.';

comment on column public.orders.test_order_reason is
'테스트 주문 사유. 예: 금액테스트/포인트테스트 운영자 테스트 계정 주문.';

comment on column public.orders.operator_test_phone is
'테스트 주문을 제출한 운영자 테스트 계정 전화번호. 숫자만 저장.';

comment on column public.orders.exclude_from_settlement is
'정산/매출 집계 제외 여부. 테스트 주문 제외 단계에서 사용.';

comment on column public.orders.exclude_from_payment_match is
'Bankda/자동입금확인/수동입금확인 후보 제외 여부.';

comment on column public.orders.exclude_from_shipping is
'송장/배송 내보내기 제외 여부.';

comment on column public.orders.exclude_from_picking is
'피킹리스트/물건 챙김 제외 여부.';

create index if not exists idx_orders_test_order_created
  on public.orders (is_test_order, created_at desc);

create index if not exists idx_orders_operator_test_phone
  on public.orders (operator_test_phone)
  where operator_test_phone is not null;

create index if not exists idx_orders_exclude_from_settlement
  on public.orders (exclude_from_settlement, created_at desc);

create index if not exists idx_orders_exclude_from_payment_match
  on public.orders (exclude_from_payment_match, created_at desc);

create index if not exists idx_orders_exclude_from_shipping
  on public.orders (exclude_from_shipping, created_at desc);

create index if not exists idx_orders_exclude_from_picking
  on public.orders (exclude_from_picking, created_at desc);

-- 확인용 조회
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in (
    'is_test_order',
    'test_order_reason',
    'operator_test_phone',
    'exclude_from_settlement',
    'exclude_from_payment_match',
    'exclude_from_shipping',
    'exclude_from_picking'
  )
order by ordinal_position;
