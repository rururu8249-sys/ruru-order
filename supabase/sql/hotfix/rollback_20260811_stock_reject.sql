-- [원복용] 2026-08-11 02:30 라이브 DB 함수 원문 그대로 (핫픽스 이전 상태)

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
as $function$

DECLARE
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
  v_order_group_id text;
  v_dup_order_ids bigint[];
  v_dup_count integer := 0;
  v_dup_point_original integer := 0;
  v_dup_point_used integer := 0;
  v_inv_row record;
  v_product_note text;
  v_stock_variants jsonb;
  v_variant_idx integer;
  v_variant jsonb;
  v_current_stock integer;
  v_deduct_qty integer;
  v_matched boolean;
BEGIN
  IF p_order_rows IS NULL OR jsonb_typeof(p_order_rows) <> 'array' THEN
    RAISE EXCEPTION '주문 상품이 없습니다.';
  END IF;

  v_order_count := jsonb_array_length(p_order_rows);

  IF v_order_count <= 0 THEN
    RAISE EXCEPTION '주문 상품이 없습니다.';
  END IF;

  v_order_group_id := nullif(p_order_rows->0->>'order_group_id', '');

  IF v_order_group_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_order_group_id, 0));

    SELECT
      array_agg(id ORDER BY id),
      count(*),
      coalesce(sum(coalesce(point_original_amount, 0)), 0)::integer,
      coalesce(sum(coalesce(point_used_amount, 0)), 0)::integer
      INTO v_dup_order_ids, v_dup_count, v_dup_point_original, v_dup_point_used
    FROM public.orders
    WHERE order_group_id = v_order_group_id;

    IF coalesce(v_dup_count, 0) > 0 THEN
      RETURN jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'inserted_count', v_dup_count,
        'order_ids', to_jsonb(v_dup_order_ids),
        'point_original_amount', v_dup_point_original,
        'point_used_amount', v_dup_point_used,
        'point_balance_before', null,
        'point_balance_after', null,
        'point_ledger_id', null
      );
    END IF;
  END IF;

  v_phone := regexp_replace(
    coalesce(p_customer_phone, p_order_rows->0->>'customer_phone', p_order_rows->0->>'phone', ''),
    '[^0-9]', '', 'g'
  );

  IF length(v_phone) < 10 THEN
    RAISE EXCEPTION '전화번호가 올바르지 않습니다.';
  END IF;

  v_youtube_nickname := left(trim(coalesce(p_youtube_nickname, p_order_rows->0->>'youtube_nickname', '')), 80);
  v_customer_name := left(trim(coalesce(p_customer_name, p_order_rows->0->>'customer_name', '')), 80);
  v_point_use_request := greatest(0, floor(coalesce(p_point_use_amount, 0))::integer);

  SELECT coalesce(current_points, 0)
    INTO v_current_points
  FROM public.customer_point_balances
  WHERE customer_phone = v_phone
  FOR UPDATE;

  v_current_points := coalesce(v_current_points, 0);

  WITH raw_rows AS (
    SELECT
      ordinality,
      row_value,
      CASE
        WHEN coalesce(row_value->>'final_amount', '') ~ '^[0-9]+$' THEN (row_value->>'final_amount')::integer
        WHEN coalesce(row_value->>'adjusted_total_price', '') ~ '^[0-9]+$' THEN (row_value->>'adjusted_total_price')::integer
        WHEN coalesce(row_value->>'total_price', '') ~ '^[0-9]+$' THEN (row_value->>'total_price')::integer
        ELSE 0
      END AS row_original_amount
    FROM jsonb_array_elements(p_order_rows) WITH ORDINALITY AS source(row_value, ordinality)
  )
  SELECT coalesce(sum(greatest(row_original_amount, 0)), 0)::integer
    INTO v_payable_before_points
  FROM raw_rows;

  IF v_current_points < 1000 OR v_point_use_request <= 0 OR v_payable_before_points <= 0 THEN
    v_point_used_amount := 0;
  ELSE
    v_point_used_amount := least(v_current_points, v_point_use_request, v_payable_before_points);
  END IF;

  v_point_balance_after := v_current_points - v_point_used_amount;

  WITH raw_rows AS (
    SELECT
      ordinality,
      row_value,
      CASE
        WHEN coalesce(row_value->>'final_amount', '') ~ '^[0-9]+$' THEN (row_value->>'final_amount')::integer
        WHEN coalesce(row_value->>'adjusted_total_price', '') ~ '^[0-9]+$' THEN (row_value->>'adjusted_total_price')::integer
        WHEN coalesce(row_value->>'total_price', '') ~ '^[0-9]+$' THEN (row_value->>'total_price')::integer
        ELSE 0
      END AS row_original_amount
    FROM jsonb_array_elements(p_order_rows) WITH ORDINALITY AS source(row_value, ordinality)
  ),
  prepared_rows AS (
    SELECT
      ordinality,
      row_value,
      greatest(row_original_amount, 0)::integer AS point_original_amount,
      least(
        greatest(row_original_amount, 0)::integer,
        greatest(
          0,
          v_point_used_amount - coalesce(
            sum(greatest(row_original_amount, 0)::integer) OVER (
              ORDER BY ordinality
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
          )::integer
        )
      )::integer AS point_used_amount
    FROM raw_rows
  ),
  rows_for_insert AS (
    SELECT
      row_value,
      point_original_amount,
      point_used_amount,
      greatest(0, point_original_amount - point_used_amount)::integer AS final_amount
    FROM prepared_rows
  ),
  inserted AS (
    INSERT INTO public.orders (
      order_group_id, order_lookup_code, broadcast_id, broadcast_name,
      broadcast_public_title, broadcast_admin_subtitle,
      youtube_nickname, customer_name, customer_phone, phone,
      zipcode, address, detail_address, request_memo,
      product_name, color, size, qty,
      product_price, shipping_fee, total_price,
      adjusted_product_price, adjusted_shipping_fee, adjusted_total_price,
      payment_method, vat_amount,
      customer_card_extra_rate_applied, actual_card_fee_rate_applied,
      order_status, admin_status, order_manage_status, shipping_status,
      is_test_order, test_order_reason, operator_test_phone,
      exclude_from_settlement, exclude_from_payment_match,
      exclude_from_shipping, exclude_from_picking,
      memo, special_note,
      point_original_amount, point_used_amount,
      point_balance_before, point_balance_after,
      point_used_at, final_amount,
      product_id
    )
    SELECT
      row_value->>'order_group_id',
      row_value->>'order_lookup_code',
      nullif(row_value->>'broadcast_id', '')::uuid,
      row_value->>'broadcast_name',
      row_value->>'broadcast_public_title',
      row_value->>'broadcast_admin_subtitle',
      coalesce(nullif(row_value->>'youtube_nickname', ''), v_youtube_nickname),
      coalesce(nullif(row_value->>'customer_name', ''), v_customer_name),
      v_phone, v_phone,
      row_value->>'zipcode', row_value->>'address', row_value->>'detail_address', row_value->>'request_memo',
      row_value->>'product_name', row_value->>'color', row_value->>'size',
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
      row_value->>'memo', row_value->>'special_note',
      point_original_amount, point_used_amount,
      CASE WHEN v_point_used_amount > 0 THEN v_current_points ELSE null END,
      CASE WHEN v_point_used_amount > 0 THEN v_point_balance_after ELSE null END,
      CASE WHEN v_point_used_amount > 0 THEN v_now ELSE null END,
      final_amount,
      nullif(row_value->>'product_id', '')::bigint
    FROM rows_for_insert
    RETURNING id
  )
  SELECT array_agg(id), count(*)
    INTO v_order_ids, v_inserted_count
  FROM inserted;

  IF v_inserted_count <> v_order_count THEN
    RAISE EXCEPTION '주문 저장 개수가 일치하지 않습니다.';
  END IF;

  -- 재고 차감
  FOR v_inv_row IN
    SELECT o.id AS order_id, o.product_id, o.color, o.size, o.qty
    FROM public.orders o
    WHERE o.id = ANY(v_order_ids)
      AND o.product_id IS NOT NULL
  LOOP
    SELECT product_note
      INTO v_product_note
    FROM public.products
    WHERE id = v_inv_row.product_id
    FOR UPDATE;

    IF v_product_note IS NULL THEN CONTINUE; END IF;

    BEGIN
      v_stock_variants := (v_product_note::jsonb)->'stock_variants';
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF ((v_product_note::jsonb)->>'stock_management_enabled')::boolean IS NOT TRUE THEN
      CONTINUE;
    END IF;

    IF v_stock_variants IS NULL OR jsonb_typeof(v_stock_variants) <> 'array' THEN
      CONTINUE;
    END IF;

    v_deduct_qty := greatest(1, coalesce(v_inv_row.qty, 1));
    v_matched := false;

    FOR v_variant_idx IN 0..jsonb_array_length(v_stock_variants)-1
    LOOP
      v_variant := v_stock_variants->v_variant_idx;

      IF (
        CASE
          WHEN coalesce(v_variant->>'color', '') IN ('없음', '') AND
               coalesce(v_inv_row.color, '') IN ('없음', '') THEN true
          ELSE trim(coalesce(v_variant->>'color', '')) = trim(coalesce(v_inv_row.color, ''))
        END
        AND
        CASE
          WHEN coalesce(v_variant->>'size', '') IN ('없음', '') AND
               coalesce(v_inv_row.size, '') IN ('없음', '') THEN true
          ELSE trim(coalesce(v_variant->>'size', '')) = trim(coalesce(v_inv_row.size, ''))
        END
      ) THEN
        v_current_stock := coalesce((v_variant->>'stock')::integer, 0);
        v_stock_variants := jsonb_set(
          v_stock_variants,
          ARRAY[v_variant_idx::text, 'stock'],
          to_jsonb(greatest(0, v_current_stock - v_deduct_qty))
        );
        v_matched := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_matched THEN
      UPDATE public.products
        SET product_note = jsonb_set(
          product_note::jsonb,
          '{stock_variants}',
          v_stock_variants
        )::text
      WHERE id = v_inv_row.product_id;

      UPDATE public.orders
        SET
          inventory_deducted_at = v_now,
          inventory_deduction_status = 'deducted',
          inventory_deduction_memo = '주문 제출 자동 차감'
        WHERE id = v_inv_row.order_id;
    END IF;
  END LOOP;

  -- 포인트 처리
  IF v_point_used_amount > 0 THEN
    INSERT INTO public.customer_point_ledger (
      id, customer_phone, youtube_nickname, customer_name,
      change_type, amount, balance_after, reason, admin_memo,
      related_order_id, related_broadcast_id,
      customer_visible, customer_seen_at, created_by
    )
    VALUES (
      v_ledger_id, v_phone,
      nullif(v_youtube_nickname, ''), nullif(v_customer_name, ''),
      'adjust', -v_point_used_amount, v_point_balance_after,
      '주문서 포인트 사용', '고객 주문서 포인트 사용 자동 차감',
      coalesce(v_order_ids[1]::text, null), null,
      true, null, 'customer-order'
    );

    INSERT INTO public.customer_point_balances (
      customer_phone, youtube_nickname, customer_name,
      current_points, total_granted_points, total_used_points,
      total_canceled_points, total_adjusted_points,
      last_granted_at, last_used_at, last_customer_seen_at, admin_memo
    )
    VALUES (
      v_phone, nullif(v_youtube_nickname, ''), nullif(v_customer_name, ''),
      v_point_balance_after, 0, v_point_used_amount, 0, 0,
      null, v_now, null, '고객 주문서 포인트 사용 자동 차감'
    )
    ON CONFLICT (customer_phone) DO UPDATE
      SET
        youtube_nickname = coalesce(excluded.youtube_nickname, public.customer_point_balances.youtube_nickname),
        customer_name = coalesce(excluded.customer_name, public.customer_point_balances.customer_name),
        current_points = v_point_balance_after,
        total_used_points = coalesce(public.customer_point_balances.total_used_points, 0) + v_point_used_amount,
        last_used_at = v_now,
        admin_memo = excluded.admin_memo,
        updated_at = v_now;

    UPDATE public.orders
      SET point_ledger_id = v_ledger_id
    WHERE id = ANY(v_order_ids);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted_count', v_inserted_count,
    'order_ids', to_jsonb(v_order_ids),
    'point_original_amount', v_payable_before_points,
    'point_used_amount', v_point_used_amount,
    'point_balance_before', CASE WHEN v_point_used_amount > 0 THEN v_current_points ELSE null END,
    'point_balance_after', CASE WHEN v_point_used_amount > 0 THEN v_point_balance_after ELSE null END,
    'point_ledger_id', CASE WHEN v_point_used_amount > 0 THEN v_ledger_id ELSE null END
  );
END;

$function$;
