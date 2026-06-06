-- supabase/sql/order_point_auto_earn_rpc.sql
-- 목적:
-- - 주문 "결제완료"(자동입금확인 / 수동입금확인 / 카드결제완료) 전환 시 구매금액(택배비 제외)의
--   설정된 비율(settings.point_earn_rate)만큼 포인트를 자동 적립하는 DB 트리거.
--
-- 주의 (중요):
-- - 이 파일을 만들고 커밋하는 것만으로는 DB에 적용되지 않습니다.
--   실제 적용은 Supabase SQL Editor에서 이 스크립트를 직접 실행해야 합니다.
-- - 돈/입금/매칭 로직은 건드리지 않습니다. 입금확인은 기존 그대로 동작하고,
--   이 트리거는 그 "이후" 결과(주문상태 전환)를 보고 적립만 추가합니다.
-- - 적립 ledger/balance 갱신은 기존 수동 포인트 지급 API(/api/admin-live/customer-points)와
--   동일한 방식(customer_point_ledger 양수 'grant' + customer_point_balances 갱신)을 그대로 사용합니다.
--   (서버 크론/자동매칭에는 관리자 세션이 없어 API 직접 호출이 불가하므로 DB 트리거로 동일 처리)
-- - 설정: settings.point_auto_earn_enabled = 'true' 이고 settings.point_earn_rate > 0 일 때만 적립.
-- - 중복 적립 금지: orders.point_earned_at 으로 1주문(그룹) 1회만.
-- - 제외 대상: 포인트 사용 주문(point_used_amount>0), 테스트 주문(is_test_order), 정산제외(exclude_from_settlement).
--   ※ "포인트로 구매한 주문은 자동적립 제외" 정책 반영. 적립 포함을 원하면 아래 조건에서 point_used_amount 줄을 빼면 됩니다.
-- - 자동적립은 고객에게 "선물 도착 팝업"을 띄우지 않습니다(customer_seen_at = now 로 미리 확인 처리).
--   고객은 포인트 내역에서만 확인하고, 주문서에는 "구매금액의 N% 적립" 안내문구로만 표시됩니다.

begin;

-- 1) 중복 적립 방지/기록용 컬럼 (ADD COLUMN only — 기존 데이터 보호)
alter table public.orders add column if not exists point_earned_at timestamptz;
alter table public.orders add column if not exists point_earned_amount integer not null default 0;

-- 2) 적립 트리거 함수
create or replace function public.accrue_order_points_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_status text;
  v_old_status text;
  v_is_confirm boolean;
  v_was_confirm boolean;
  v_enabled boolean;
  v_rate numeric;
  v_now timestamptz := now();
  v_group text;
  v_product_amount integer := 0;
  v_accrual integer := 0;
  v_current integer := 0;
  v_balance_after integer := 0;
  v_phone text;
  v_nick text;
  v_name text;
begin
  -- 재귀 방지(아래 point_earned_at 업데이트로 인한 재호출 차단)
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  v_new_status := coalesce(nullif(trim(NEW.admin_order_status_v2), ''), nullif(trim(NEW.order_manage_status), ''), '');
  v_old_status := coalesce(nullif(trim(OLD.admin_order_status_v2), ''), nullif(trim(OLD.order_manage_status), ''), '');

  v_is_confirm := (v_new_status ~ '입금확인') or (v_new_status = '카드결제완료');
  v_was_confirm := (v_old_status ~ '입금확인') or (v_old_status = '카드결제완료');

  -- "결제완료로 전환"되는 순간에만 적립
  if not v_is_confirm or v_was_confirm then
    return null;
  end if;

  -- 이미 적립된 주문(이 행)이면 중단
  if NEW.point_earned_at is not null then
    return null;
  end if;

  -- 같은 주문그룹이 이미 적립됐으면 중단(1주문 1회)
  v_group := nullif(trim(coalesce(NEW.order_group_id, '')), '');
  if v_group is not null and exists (
    select 1 from public.orders where order_group_id = v_group and point_earned_at is not null
  ) then
    return null;
  end if;

  -- 설정 읽기
  select (lower(trim(value)) = 'true') into v_enabled from public.settings where key = 'point_auto_earn_enabled' limit 1;
  select coalesce(nullif(trim(value), '')::numeric, 0) into v_rate from public.settings where key = 'point_earn_rate' limit 1;

  if coalesce(v_enabled, false) = false or coalesce(v_rate, 0) <= 0 then
    return null;
  end if;

  -- 적립 대상 상품금액(택배비 제외) = 그룹 합. 포인트사용/테스트/정산제외 주문은 제외.
  if v_group is not null then
    select coalesce(sum(
      coalesce(nullif(adjusted_product_price, 0), product_price, 0) * greatest(coalesce(qty, 1), 1)
    ), 0)::integer
      into v_product_amount
    from public.orders
    where order_group_id = v_group
      and coalesce(point_used_amount, 0) = 0
      and coalesce(exclude_from_settlement, false) = false
      and coalesce(is_test_order, false) = false;
  else
    if coalesce(NEW.point_used_amount, 0) <> 0
       or coalesce(NEW.exclude_from_settlement, false)
       or coalesce(NEW.is_test_order, false) then
      v_product_amount := 0;
    else
      v_product_amount := coalesce(nullif(NEW.adjusted_product_price, 0), NEW.product_price, 0) * greatest(coalesce(NEW.qty, 1), 1);
    end if;
  end if;

  v_accrual := floor(v_product_amount * v_rate / 100.0)::integer;

  -- 적립액이 0(또는 제외 대상)이어도 재처리 방지를 위해 표시만 남기고 종료
  if v_accrual <= 0 then
    update public.orders set point_earned_at = v_now, point_earned_amount = 0
      where (v_group is not null and order_group_id = v_group) or id = NEW.id;
    return null;
  end if;

  v_phone := regexp_replace(coalesce(NEW.customer_phone, NEW.phone, ''), '[^0-9]', '', 'g');
  if length(v_phone) < 10 then
    return null;
  end if;
  v_nick := nullif(trim(coalesce(NEW.youtube_nickname, '')), '');
  v_name := nullif(trim(coalesce(NEW.customer_name, '')), '');

  -- 현재 잔액(행 잠금)
  select coalesce(current_points, 0) into v_current
    from public.customer_point_balances where customer_phone = v_phone for update;
  v_current := coalesce(v_current, 0);
  v_balance_after := v_current + v_accrual;

  -- 적립 이력(양수 grant) — customer_seen_at=now 로 자동적립 팝업 미표시(내역엔 노출)
  insert into public.customer_point_ledger (
    customer_phone, youtube_nickname, customer_name,
    change_type, amount, balance_after, reason, admin_memo,
    related_order_id, customer_visible, customer_seen_at, created_by
  ) values (
    v_phone, v_nick, v_name,
    'grant', v_accrual, v_balance_after, '주문 결제완료 자동적립', '결제완료 자동적립(' || v_rate::text || '%)',
    NEW.id::text, true, v_now, 'auto-earn'
  );

  -- 잔액 갱신
  insert into public.customer_point_balances (
    customer_phone, youtube_nickname, customer_name,
    current_points, total_granted_points, total_used_points,
    last_granted_at, updated_at
  ) values (
    v_phone, v_nick, v_name,
    v_balance_after, v_accrual, 0,
    v_now, v_now
  )
  on conflict (customer_phone) do update set
    youtube_nickname = coalesce(excluded.youtube_nickname, public.customer_point_balances.youtube_nickname),
    customer_name = coalesce(excluded.customer_name, public.customer_point_balances.customer_name),
    current_points = public.customer_point_balances.current_points + v_accrual,
    total_granted_points = coalesce(public.customer_point_balances.total_granted_points, 0) + v_accrual,
    last_granted_at = v_now,
    updated_at = v_now;

  -- 중복 적립 방지 표시(그룹 전체)
  update public.orders set point_earned_at = v_now, point_earned_amount = v_accrual
    where (v_group is not null and order_group_id = v_group) or id = NEW.id;

  return null;
end;
$$;

-- 3) 트리거 연결 (주문상태 컬럼이 바뀔 때만 발동)
drop trigger if exists trg_accrue_order_points on public.orders;
create trigger trg_accrue_order_points
  after update of admin_order_status_v2, order_manage_status on public.orders
  for each row
  execute function public.accrue_order_points_on_confirm();

comment on function public.accrue_order_points_on_confirm() is
  '주문 결제완료(자동/수동 입금확인·카드결제완료) 전환 시 구매금액(택배비 제외)의 settings.point_earn_rate%를 자동 적립. 포인트사용/테스트/정산제외 주문 제외, 1주문 1회(point_earned_at).';

commit;
