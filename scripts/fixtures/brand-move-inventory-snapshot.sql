-- Read-only production definition/schema snapshot, 2026-10-05.
-- Test fixture only: no customer data, not a deployment migration.
create table public.cart_reservations (
  "id" bigint,
  "session_key" text,
  "customer_phone" text,
  "product_id" text,
  "color" text,
  "size" text,
  "qty" integer,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone,
  "nickname" text,
  "customer_name" text,
  "product_name" text,
  "detail_name" text,
  "unit_price" integer,
  "last_synced_at" timestamp with time zone,
  "kakao_id" text
);
create table public.customer_point_balances (
  "id" uuid,
  "customer_phone" text primary key,
  "youtube_nickname" text,
  "customer_name" text,
  "current_points" integer,
  "total_granted_points" integer,
  "total_used_points" integer,
  "total_canceled_points" integer,
  "total_adjusted_points" integer,
  "last_granted_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "last_customer_seen_at" timestamp with time zone,
  "admin_memo" text,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "customer_id" bigint
);
create table public.customer_point_ledger (
  "id" uuid,
  "customer_phone" text,
  "youtube_nickname" text,
  "customer_name" text,
  "change_type" text,
  "amount" integer,
  "balance_after" integer,
  "reason" text,
  "admin_memo" text,
  "related_order_id" text,
  "related_broadcast_id" text,
  "customer_visible" boolean,
  "customer_seen_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone,
  "customer_id" bigint,
  "source_key" text
);
create table public.orders (
  "id" bigserial primary key,
  "created_at" timestamp with time zone,
  "broadcast_name" text,
  "youtube_nickname" text,
  "customer_name" text,
  "phone" text,
  "category" text,
  "product_name" text,
  "color" text,
  "size" text,
  "qty" integer,
  "product_price" integer,
  "shipping_fee" integer,
  "total_price" integer,
  "shipping_status" text,
  "memo" text,
  "special_note" text,
  "order_status" text,
  "order_group_id" text,
  "admin_status" text,
  "payment_method" text,
  "vat_amount" integer,
  "broadcast_subtitle" text,
  "member_memo" text,
  "customer_phone" text,
  "kakao_id" text,
  "kakao_nickname" text,
  "zipcode" text,
  "address" text,
  "detail_address" text,
  "address_type" text,
  "customer_match_status" text,
  "customer_match_memo" text,
  "save_as_default_address" boolean,
  "request_memo" text,
  "broadcast_id" uuid,
  "broadcast_public_title" text,
  "broadcast_admin_subtitle" text,
  "rozen_exported" boolean,
  "admin_memo" text,
  "order_lookup_code" text,
  "adjusted_product_price" numeric,
  "adjusted_shipping_fee" numeric,
  "adjusted_total_price" numeric,
  "admin_price_memo" text,
  "combine_shipping_applied" boolean,
  "original_shipping_fee" numeric,
  "final_shipping_fee" numeric,
  "combine_shipping_memo" text,
  "order_manage_status" text,
  "rozen_printed" boolean,
  "rozen_printed_at" timestamp with time zone,
  "status_memo" text,
  "shipment_exclude" boolean,
  "cancel_reason" text,
  "refund_type" text,
  "refund_amount" numeric,
  "refund_memo" text,
  "is_deleted" boolean,
  "deleted_at" timestamp with time zone,
  "delete_memo" text,
  "is_permanently_deleted" boolean,
  "permanently_deleted_at" timestamp with time zone,
  "pin_verified" boolean,
  "order_items" jsonb,
  "item_change_history" jsonb,
  "admin_order_status_v2" text,
  "final_amount" bigint,
  "tracking_number" text,
  "tracking_company" text,
  "shipped_at" timestamp with time zone,
  "customer_id" bigint,
  "deposit_confirmed_at" timestamp with time zone,
  "customer_card_extra_rate_applied" numeric,
  "actual_card_fee_rate_applied" numeric,
  "is_test_order" boolean,
  "test_order_reason" text,
  "operator_test_phone" text,
  "exclude_from_settlement" boolean,
  "exclude_from_payment_match" boolean,
  "exclude_from_shipping" boolean,
  "exclude_from_picking" boolean,
  "point_original_amount" integer,
  "point_used_amount" integer,
  "point_balance_before" integer,
  "point_balance_after" integer,
  "point_ledger_id" uuid,
  "point_used_at" timestamp with time zone,
  "point_refunded_amount" integer,
  "point_refund_ledger_id" uuid,
  "point_refunded_at" timestamp with time zone,
  "point_refund_memo" text,
  "product_id" bigint,
  "inventory_deducted_at" timestamp with time zone,
  "inventory_ledger_id" uuid,
  "inventory_deduction_status" text,
  "inventory_deduction_memo" text,
  "inventory_restored_at" timestamp with time zone,
  "inventory_restore_ledger_id" uuid,
  "inventory_restore_status" text,
  "inventory_restore_memo" text,
  "point_earned_at" timestamp with time zone,
  "point_earned_amount" integer,
  "recipient_name" text,
  "recipient_phone" text,
  "shipped_prev_status" text,
  "picked_at" timestamp with time zone,
  "return_status" text,
  "return_reason" text,
  "return_amount" integer,
  "return_updated_at" timestamp with time zone,
  "collected_at" timestamp with time zone,
  "invoice_printed_at" timestamp with time zone,
  "picking_list_printed_at" timestamp with time zone,
  "customer_order_segment" text,
  "payment_bank_account_id" text,
  "payment_bank_name" text,
  "payment_bank_account" text,
  "payment_bank_holder" text,
  "payment_bank_assigned_at" timestamp with time zone,
  "event_gift_winner_id" uuid,
  "payment_bank_assignment_source" text,
  "repick_required_at" timestamp with time zone,
  "repick_before" jsonb,
  "repick_resolved_at" timestamp with time zone
);
create table public.products (
  "id" bigint primary key,
  "product_name" text,
  "description" text,
  "price" integer,
  "stock" integer,
  "delivery_type" text,
  "can_combine_shipping" boolean,
  "product_type" text,
  "external_image_url" text,
  "main_image_url" text,
  "product_status" text,
  "sort_order" integer,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "shipping_type" text,
  "combine_shipping" text,
  "image_url" text,
  "status" text,
  "color_options" jsonb,
  "size_options" jsonb,
  "size_option_enabled" boolean,
  "is_pinned" boolean,
  "image_path" text,
  "delivery_group_key" text,
  "product_note" text,
  "product_description" text,
  "detail_image_urls" jsonb,
  "pinned_at" timestamp with time zone,
  "is_soldout" boolean,
  "sale_mode" text,
  "badge_type" text,
  "in_shop" boolean,
  "mall_sort_order" integer,
  "badge_types" text[],
  "sold_qty_total" integer,
  "sold_qty_30d" integer,
  "sold_stat_at" timestamp with time zone,
  "repeat_buyer_count" integer,
  "sales_rank_pct" numeric
);
CREATE OR REPLACE FUNCTION public.submit_customer_order_with_points(p_order_rows jsonb, p_point_use_amount integer DEFAULT 0, p_customer_phone text DEFAULT NULL::text, p_youtube_nickname text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_session_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

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
  v_others_hold integer;
  v_inventory_color text;
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
    SELECT o.id AS order_id, o.product_id, o.product_name, o.color, o.size, o.qty
    FROM public.orders o
    WHERE o.id = ANY(v_order_ids)
      AND o.product_id IS NOT NULL
    ORDER BY o.product_id, o.id
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

    -- 브랜드 대표상품은 주문표시 color를 실제 색상만 유지하고 재고 키만 세부상품/색상으로 조합한다.
    v_inventory_color := coalesce(trim(v_inv_row.color), '');
    IF jsonb_typeof((v_product_note::jsonb)->'brand_group'->'detail_options') = 'object'
       AND ((v_product_note::jsonb)->'brand_group'->'detail_options') ? coalesce(trim(v_inv_row.product_name), '') THEN
      v_inventory_color := coalesce(trim(v_inv_row.product_name), '') || ' / ' ||
        coalesce(nullif(trim(coalesce(v_inv_row.color, '')), ''), '없음');
    END IF;

    v_deduct_qty := greatest(1, coalesce(v_inv_row.qty, 1));
    v_matched := false;

    FOR v_variant_idx IN 0..jsonb_array_length(v_stock_variants)-1
    LOOP
      v_variant := v_stock_variants->v_variant_idx;

      IF (
        CASE
          WHEN coalesce(v_variant->>'color', '') IN ('없음', '') AND
               coalesce(v_inventory_color, '') IN ('없음', '') THEN true
          ELSE trim(coalesce(v_variant->>'color', '')) = trim(coalesce(v_inventory_color, ''))
        END
        AND
        CASE
          WHEN coalesce(v_variant->>'size', '') IN ('없음', '') AND
               coalesce(v_inv_row.size, '') IN ('없음', '') THEN true
          ELSE trim(coalesce(v_variant->>'size', '')) = trim(coalesce(v_inv_row.size, ''))
        END
      ) THEN
        v_current_stock := coalesce((v_variant->>'stock')::integer, 0);

        -- [2026-08-11 v2] 다른 손님의 유효 선점분 계산 (만료분 자동 제외)
        SELECT coalesce(sum(r.qty), 0) INTO v_others_hold
        FROM public.cart_reservations r
        WHERE r.product_id = v_inv_row.product_id::text
          AND r.expires_at > v_now
          AND NOT (
            (p_session_key IS NOT NULL AND r.session_key = p_session_key)
            OR (coalesce(v_phone, '') <> '' AND r.customer_phone = v_phone)
          )
          AND (CASE WHEN coalesce(trim(r.color),'') = '없음' THEN '' ELSE coalesce(trim(r.color),'') END)
              = (CASE WHEN coalesce(trim(coalesce(v_inventory_color,'')),'') = '없음' THEN '' ELSE trim(coalesce(v_inventory_color,'')) END)
          AND (CASE WHEN coalesce(trim(r.size),'') = '없음' THEN '' ELSE coalesce(trim(r.size),'') END)
              = (CASE WHEN coalesce(trim(coalesce(v_inv_row.size,'')),'') = '없음' THEN '' ELSE trim(coalesce(v_inv_row.size,'')) END);

        -- [2026-08-11 v2] 재고 부족 또는 남의 선점분 침범 시 주문 거부 → 전체 롤백(주문·포인트 미저장)
        IF v_deduct_qty > greatest(0, v_current_stock - v_others_hold) THEN
          RAISE EXCEPTION '재고가 부족합니다. (상품ID: %, 색상: %, 사이즈: %, 구매가능: %개, 주문수량: %개)',
            v_inv_row.product_id,
            coalesce(nullif(trim(coalesce(v_inv_row.color, '')), ''), '없음'),
            coalesce(nullif(trim(coalesce(v_inv_row.size, '')), ''), '없음'),
            greatest(0, v_current_stock - v_others_hold), v_deduct_qty;
        END IF;
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

  -- [2026-08-11 v2] 제출 완료된 본인 선점 해제 (세션키 또는 전화번호 기준)
  IF p_session_key IS NOT NULL OR coalesce(v_phone, '') <> '' THEN
    DELETE FROM public.cart_reservations r
    WHERE (p_session_key IS NOT NULL AND r.session_key = p_session_key)
       OR (coalesce(v_phone, '') <> '' AND r.customer_phone = v_phone);
  END IF;

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

$function$

