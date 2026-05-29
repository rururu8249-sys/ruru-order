-- supabase/sql/customer_order_submit_with_points_rpc.sql
-- 목적:
-- - 고객 주문 저장 + 포인트 사용 차감 + 포인트 이력 저장 + 포인트 잔액 갱신 + 주문 point_ledger_id 연결을
--   Supabase RPC 1회 호출 안의 DB 트랜잭션으로 처리하기 위한 함수 준비.
--
-- 주의:
-- - 이 파일을 만들고 커밋하는 것만으로는 DB에 적용되지 않습니다.
-- - 실제 적용은 Supabase SQL Editor에서 별도 실행해야 합니다.
-- - 기존 주문 재계산 없음.
-- - 기존 주문 total_price / adjusted_total_price / final_amount 일괄 변경 없음.
-- - /order 화면 연결은 별도 단계에서 진행.

begin;

create or replace function public.submit_customer_order_with_points(
  p_order_rows jsonb,
  p_point_use_amount integer default 0,
  p_customer_phone text default null,
  p_youtube_nickname text default null,
  p_customer_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_youtube_nickname text;
  v_customer_name text;
  v_order_count integer;
  v_now timestamptz := now();

  v_current_points integer := 0;
  v_point_use_request integer := 0;
  v_payable_before_points integer := 0;
  v_point_used_amount integer := 0;
  v_point_balance_after integer := 0;

  v_ledger_id uuid := gen_random_uuid();
  v_order_ids bigint[] := array[]::bigint[];
  v_inserted_count integer := 0;
begin
  if p_order_rows is null or jsonb_typeof(p_order_rows) <> 'array' then
    raise exception '주문 상품이 없습니다.';
  end if;

  v_order_count := jsonb_array_length(p_order_rows);

  if v_order_count <= 0 then
    raise exception '주문 상품이 없습니다.';
  end if;

  v_phone := regexp_replace(
    coalesce(
      p_customer_phone,
      p_order_rows->0->>'customer_phone',
      p_order_rows->0->>'phone',
      ''
    ),
    '[^0-9]',
    '',
    'g'
  );

  if length(v_phone) < 10 then
    raise exception '전화번호가 올바르지 않습니다.';
  end if;

  v_youtube_nickname := left(trim(coalesce(
    p_youtube_nickname,
    p_order_rows->0->>'youtube_nickname',
    ''
  )), 80);

  v_customer_name := left(trim(coalesce(
    p_customer_name,
    p_order_rows->0->>'customer_name',
    ''
  )), 80);

  v_point_use_request := greatest(0, floor(coalesce(p_point_use_amount, 0))::integer);

  select coalesce(current_points, 0)
    into v_current_points
  from public.customer_point_balances
  where customer_phone = v_phone
  for update;

  v_current_points := coalesce(v_current_points, 0);

  with raw_rows as (
    select
      ordinality,
      row_value,
      case
        when coalesce(row_value->>'final_amount', '') ~ '^[0-9]+$' then (row_value->>'final_amount')::integer
        when coalesce(row_value->>'adjusted_total_price', '') ~ '^[0-9]+$' then (row_value->>'adjusted_total_price')::integer
        when coalesce(row_value->>'total_price', '') ~ '^[0-9]+$' then (row_value->>'total_price')::integer
        else 0
      end as row_original_amount
    from jsonb_array_elements(p_order_rows) with ordinality as source(row_value, ordinality)
  )
  select coalesce(sum(greatest(row_original_amount, 0)), 0)::integer
    into v_payable_before_points
  from raw_rows;

  if v_current_points < 1000 or v_point_use_request <= 0 or v_payable_before_points <= 0 then
    v_point_used_amount := 0;
  else
    v_point_used_amount := least(v_current_points, v_point_use_request, v_payable_before_points);
  end if;

  v_point_balance_after := v_current_points - v_point_used_amount;

  with raw_rows as (
    select
      ordinality,
      row_value,
      case
        when coalesce(row_value->>'final_amount', '') ~ '^[0-9]+$' then (row_value->>'final_amount')::integer
        when coalesce(row_value->>'adjusted_total_price', '') ~ '^[0-9]+$' then (row_value->>'adjusted_total_price')::integer
        when coalesce(row_value->>'total_price', '') ~ '^[0-9]+$' then (row_value->>'total_price')::integer
        else 0
      end as row_original_amount
    from jsonb_array_elements(p_order_rows) with ordinality as source(row_value, ordinality)
  ),
  prepared_rows as (
    select
      ordinality,
      row_value,
      greatest(row_original_amount, 0)::integer as point_original_amount,
      least(
        greatest(row_original_amount, 0)::integer,
        greatest(
          0,
          v_point_used_amount - coalesce(
            sum(greatest(row_original_amount, 0)::integer) over (
              order by ordinality
              rows between unbounded preceding and 1 preceding
            ),
            0
          )::integer
        )
      )::integer as point_used_amount
    from raw_rows
  ),
  rows_for_insert as (
    select
      row_value,
      point_original_amount,
      point_used_amount,
      greatest(0, point_original_amount - point_used_amount)::integer as final_amount
    from prepared_rows
  ),
  inserted as (
    insert into public.orders (
      order_group_id,
      order_lookup_code,
      broadcast_id,
      broadcast_name,
      broadcast_public_title,
      broadcast_admin_subtitle,
      youtube_nickname,
      customer_name,
      customer_phone,
      phone,
      zipcode,
      address,
      detail_address,
      request_memo,
      product_name,
      color,
      size,
      qty,
      product_price,
      shipping_fee,
      total_price,
      adjusted_product_price,
      adjusted_shipping_fee,
      adjusted_total_price,
      payment_method,
      vat_amount,
      customer_card_extra_rate_applied,
      actual_card_fee_rate_applied,
      order_status,
      admin_status,
      order_manage_status,
      shipping_status,
      is_test_order,
      test_order_reason,
      operator_test_phone,
      exclude_from_settlement,
      exclude_from_payment_match,
      exclude_from_shipping,
      exclude_from_picking,
      memo,
      special_note,
      point_original_amount,
      point_used_amount,
      point_balance_before,
      point_balance_after,
      point_used_at,
      final_amount
    )
    select
      row_value->>'order_group_id',
      row_value->>'order_lookup_code',
      nullif(row_value->>'broadcast_id', '')::uuid,
      row_value->>'broadcast_name',
      row_value->>'broadcast_public_title',
      row_value->>'broadcast_admin_subtitle',
      coalesce(nullif(row_value->>'youtube_nickname', ''), v_youtube_nickname),
      coalesce(nullif(row_value->>'customer_name', ''), v_customer_name),
      v_phone,
      v_phone,
      row_value->>'zipcode',
      row_value->>'address',
      row_value->>'detail_address',
      row_value->>'request_memo',
      row_value->>'product_name',
      row_value->>'color',
      row_value->>'size',
      coalesce(nullif(row_value->>'qty', '')::integer, 0),
      coalesce(nullif(row_value->>'product_price', '')::integer, 0),
      coalesce(nullif(row_value->>'shipping_fee', '')::integer, 0),
      coalesce(nullif(row_value->>'total_price', '')::integer, 0),
      coalesce(nullif(row_value->>'adjusted_product_price', '')::integer, 0),
      coalesce(nullif(row_value->>'adjusted_shipping_fee', '')::integer, 0),
      coalesce(nullif(row_value->>'adjusted_total_price', '')::integer, 0),
      row_value->>'payment_method',
      coalesce(nullif(row_value->>'vat_amount', '')::integer, 0),
      coalesce(nullif(row_value->>'customer_card_extra_rate_applied', '')::integer, 0),
      coalesce(nullif(row_value->>'actual_card_fee_rate_applied', '')::integer, 0),
      coalesce(nullif(row_value->>'order_status', ''), '주문완료'),
      coalesce(nullif(row_value->>'admin_status', ''), '관리자 확인 전'),
      coalesce(nullif(row_value->>'order_manage_status', ''), '주문확인전'),
      coalesce(nullif(row_value->>'shipping_status', ''), '합배송중'),
      coalesce((row_value->>'is_test_order')::boolean, false),
      nullif(row_value->>'test_order_reason', ''),
      nullif(row_value->>'operator_test_phone', ''),
      coalesce((row_value->>'exclude_from_settlement')::boolean, false),
      coalesce((row_value->>'exclude_from_payment_match')::boolean, false),
      coalesce((row_value->>'exclude_from_shipping')::boolean, false),
      coalesce((row_value->>'exclude_from_picking')::boolean, false),
      row_value->>'memo',
      row_value->>'special_note',
      point_original_amount,
      point_used_amount,
      case when v_point_used_amount > 0 then v_current_points else null end,
      case when v_point_used_amount > 0 then v_point_balance_after else null end,
      case when v_point_used_amount > 0 then v_now else null end,
      final_amount
    from rows_for_insert
    returning id
  )
  select array_agg(id), count(*)
    into v_order_ids, v_inserted_count
  from inserted;

  if v_inserted_count <> v_order_count then
    raise exception '주문 저장 개수가 일치하지 않습니다.';
  end if;

  if v_point_used_amount > 0 then
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
      related_broadcast_id,
      customer_visible,
      customer_seen_at,
      created_by
    )
    values (
      v_ledger_id,
      v_phone,
      nullif(v_youtube_nickname, ''),
      nullif(v_customer_name, ''),
      'adjust',
      -v_point_used_amount,
      v_point_balance_after,
      '주문서 포인트 사용',
      '고객 주문서 포인트 사용 자동 차감',
      coalesce(v_order_ids[1]::text, null),
      null,
      true,
      null,
      'customer-order'
    );

    insert into public.customer_point_balances (
      customer_phone,
      youtube_nickname,
      customer_name,
      current_points,
      total_granted_points,
      total_used_points,
      total_canceled_points,
      total_adjusted_points,
      last_granted_at,
      last_used_at,
      last_customer_seen_at,
      admin_memo
    )
    values (
      v_phone,
      nullif(v_youtube_nickname, ''),
      nullif(v_customer_name, ''),
      v_point_balance_after,
      0,
      v_point_used_amount,
      0,
      0,
      null,
      v_now,
      null,
      '고객 주문서 포인트 사용 자동 차감'
    )
    on conflict (customer_phone) do update
      set
        youtube_nickname = coalesce(excluded.youtube_nickname, public.customer_point_balances.youtube_nickname),
        customer_name = coalesce(excluded.customer_name, public.customer_point_balances.customer_name),
        current_points = v_point_balance_after,
        total_used_points = coalesce(public.customer_point_balances.total_used_points, 0) + v_point_used_amount,
        last_used_at = v_now,
        admin_memo = excluded.admin_memo,
        updated_at = v_now;

    update public.orders
      set point_ledger_id = v_ledger_id
    where id = any(v_order_ids);
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted_count', v_inserted_count,
    'order_ids', to_jsonb(v_order_ids),
    'point_original_amount', v_payable_before_points,
    'point_used_amount', v_point_used_amount,
    'point_balance_before', case when v_point_used_amount > 0 then v_current_points else null end,
    'point_balance_after', case when v_point_used_amount > 0 then v_point_balance_after else null end,
    'point_ledger_id', case when v_point_used_amount > 0 then v_ledger_id else null end
  );
end;
$$;

comment on function public.submit_customer_order_with_points(jsonb, integer, text, text, text) is
  '고객 주문 저장과 포인트 사용 차감을 하나의 DB 트랜잭션으로 처리하는 RPC. /order 연결 전 충분한 검수 후 사용.';

commit;
