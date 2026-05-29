-- supabase/sql/order_point_cancel_restore_rpc.sql
-- 목적:
-- - /admin-live 주문서 자체 취소 시 포인트 사용 주문의 사용 포인트를 자동 복구한다.
-- - 주문상태 변경 + 포인트 ledger insert + 포인트 잔액 증가 + orders 복구 기록을 DB 트랜잭션으로 묶는다.
--
-- 실제 스키마 근거:
-- - customer_point_ledger에는 memo 컬럼이 없고 admin_memo 컬럼이 있다.
-- - customer_point_ledger.related_order_id는 text 타입이다.
-- - customer_point_ledger에는 balance_before 컬럼이 없고 balance_after 컬럼만 사용한다.
--
-- 운영 기준:
-- - 전체 주문취소/주문서취소 상태에서만 사용한다.
-- - point_used_amount > 0 인 주문만 포인트 복구 대상이다.
-- - point_refund_ledger_id / point_refunded_at / point_refunded_amount 로 중복복구를 차단한다.
-- - 부분환불은 이 RPC의 자동복구 대상이 아니다.
-- - 주문복구 시 복구 포인트 재차감은 1차 자동화 대상이 아니다.
--
-- 주의:
-- - 기존 주문 금액, final_amount, 입금내역, Bankda, 정산 계산식은 변경하지 않는다.

begin;

alter table public.orders
  add column if not exists point_refunded_amount integer not null default 0;

comment on column public.orders.point_refunded_amount is
  '주문취소 등으로 자동 복구된 포인트 금액. 중복복구 방지와 운영 추적용.';

alter table public.orders
  add column if not exists point_refund_ledger_id uuid;

comment on column public.orders.point_refund_ledger_id is
  '포인트 복구 이력 customer_point_ledger.id 연결용. 값이 있으면 자동 중복복구 금지.';

alter table public.orders
  add column if not exists point_refunded_at timestamptz;

comment on column public.orders.point_refunded_at is
  '주문취소 등으로 포인트가 자동 복구된 시각. 값이 있으면 자동 중복복구 금지.';

alter table public.orders
  add column if not exists point_refund_memo text;

comment on column public.orders.point_refund_memo is
  '포인트 자동복구 사유/메모.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_point_refunded_amount_non_negative'
  ) then
    alter table public.orders
      add constraint orders_point_refunded_amount_non_negative
      check (point_refunded_amount >= 0);
  end if;
end $$;

create index if not exists orders_point_refund_ledger_id_idx
  on public.orders (point_refund_ledger_id)
  where point_refund_ledger_id is not null;

create index if not exists orders_point_refunded_at_idx
  on public.orders (point_refunded_at)
  where point_refunded_at is not null;

create or replace function public.cancel_order_and_restore_points(
  p_order_ids integer[],
  p_cancel_status text default '주문취소',
  p_admin_memo text default '주문서취소 자동 포인트 복구'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_order record;
  v_current_points integer;
  v_next_points integer;
  v_restore_amount integer;
  v_ledger_id uuid;
  v_updated_count integer := 0;
  v_restored_count integer := 0;
  v_restored_total integer := 0;
  v_skipped_no_point integer := 0;
  v_skipped_already_refunded integer := 0;
  v_clean_memo text := coalesce(nullif(trim(p_admin_memo), ''), '주문서취소 자동 포인트 복구');
  v_clean_status text := coalesce(nullif(trim(p_cancel_status), ''), '주문취소');
begin
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    return jsonb_build_object(
      'ok', true,
      'mode', 'empty_order_ids',
      'updated_count', 0,
      'restored_count', 0,
      'restored_total', 0,
      'skipped_no_point', 0,
      'skipped_already_refunded', 0
    );
  end if;

  for v_order in
    select
      id,
      customer_phone,
      youtube_nickname,
      customer_name,
      point_used_amount,
      point_refunded_amount,
      point_refund_ledger_id,
      point_refunded_at
    from public.orders
    where id = any(p_order_ids)
    for update
  loop
    update public.orders
      set
        admin_order_status_v2 = v_clean_status,
        order_manage_status = v_clean_status
      where id = v_order.id;

    v_updated_count := v_updated_count + 1;
    v_restore_amount := greatest(0, coalesce(v_order.point_used_amount, 0));

    if v_restore_amount <= 0 then
      v_skipped_no_point := v_skipped_no_point + 1;
      continue;
    end if;

    if coalesce(v_order.point_refunded_amount, 0) > 0
      or v_order.point_refund_ledger_id is not null
      or v_order.point_refunded_at is not null
    then
      v_skipped_already_refunded := v_skipped_already_refunded + 1;
      continue;
    end if;

    if coalesce(nullif(trim(v_order.customer_phone), ''), '') = '' then
      raise exception '포인트 복구 실패: 주문 % 고객 전화번호가 없습니다.', v_order.id;
    end if;

    select coalesce(current_points, 0)
      into v_current_points
    from public.customer_point_balances
    where customer_phone = v_order.customer_phone
    for update;

    if not found then
      raise exception '포인트 복구 실패: 주문 % 고객 포인트 잔액 row가 없습니다.', v_order.id;
    end if;

    v_next_points := greatest(0, coalesce(v_current_points, 0)) + v_restore_amount;
    v_ledger_id := gen_random_uuid();

    insert into public.customer_point_ledger (
      id,
      customer_phone,
      youtube_nickname,
      customer_name,
      change_type,
      amount,
      balance_after,
      reason,
      admin_memo,
      related_order_id,
      customer_visible,
      created_by,
      created_at
    ) values (
      v_ledger_id,
      v_order.customer_phone,
      v_order.youtube_nickname,
      v_order.customer_name,
      'cancel',
      v_restore_amount,
      v_next_points,
      '주문취소 포인트 자동복구',
      v_clean_memo,
      v_order.id::text,
      true,
      'admin-live-order-cancel',
      v_now
    );

    update public.customer_point_balances
      set
        youtube_nickname = coalesce(nullif(v_order.youtube_nickname, ''), youtube_nickname),
        customer_name = coalesce(nullif(v_order.customer_name, ''), customer_name),
        current_points = v_next_points,
        total_canceled_points = coalesce(total_canceled_points, 0) + v_restore_amount
      where customer_phone = v_order.customer_phone;

    update public.orders
      set
        point_refunded_amount = v_restore_amount,
        point_refund_ledger_id = v_ledger_id,
        point_refunded_at = v_now,
        point_refund_memo = v_clean_memo
      where id = v_order.id;

    v_restored_count := v_restored_count + 1;
    v_restored_total := v_restored_total + v_restore_amount;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'mode', 'cancel_order_and_restore_points',
    'updated_count', v_updated_count,
    'restored_count', v_restored_count,
    'restored_total', v_restored_total,
    'skipped_no_point', v_skipped_no_point,
    'skipped_already_refunded', v_skipped_already_refunded
  );
end;
$$;

comment on function public.cancel_order_and_restore_points(integer[], text, text) is
  '주문서 자체 취소 시 주문상태 변경과 포인트 자동복구를 하나의 DB 트랜잭션으로 처리한다. 부분환불/주문복구 재차감은 포함하지 않는다.';

commit;
