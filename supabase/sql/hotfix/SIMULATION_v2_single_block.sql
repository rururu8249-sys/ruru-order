-- ============================================================================
-- [시뮬레이션 v2 — 단일 블록·완전 롤백 보장]
-- 전체가 하나의 DO 문 = 하나의 트랜잭션. 마지막에 의도적 예외를 던져
-- 함수 적용·테스트 주문·선점 전부 무조건 롤백됩니다 (DB 흔적 0).
-- ⚠️ 결과는 "빨간 에러 박스" 안에 표로 출력됩니다 — 에러처럼 보여도 그게 정상 결과입니다!
-- ============================================================================
do $outer$
declare
  r jsonb; r2 jsonb;
  g1 text := gen_random_uuid()::text;
  v_cnt integer; v_stock integer;
  rows1 jsonb;
  v_p record; v_note jsonb; v_i integer;
  v_pickc text; v_picks text; v_pickq integer;
  ok1 boolean; ok2 boolean; ok3 boolean;
  v_n integer := 0;
  v_pid1 text; v_c1 text; v_s1 text;
  v_pid2 text; v_c2 text; v_s2 text;
begin
  -- 결과 기록기 (임시테이블 대신 임시 함수 — 롤백 시 함께 소멸)
  create table if not exists _sim_report(seq serial, line text);
  execute $recfn$
    create or replace function public._sim_rec(p_step text, p_expect text, p_got text, p_pass boolean)
    returns void language sql as $body$
      insert into _sim_report(line)
      values (format('%s | 기대: %s | 실제: %s | %s', p_step, p_expect, p_got,
              case when p_pass then 'PASS ✅' else 'FAIL ❌' end));
    $body$;
  $recfn$;

  -- 새 함수 임시 적용 (이 블록 안에서만 유효 — 마지막에 전부 롤백)
  execute $ddl1$
create or replace function public.claim_cart_hold(
  p_session_key text,
  p_phone text default null,
  p_nickname text default null,
  p_customer_name text default null,
  p_items jsonb default '[]'::jsonb,
  p_hold_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $claim$
declare
  v_now timestamptz := now();
  v_minutes integer := least(43200, greatest(10, coalesce(p_hold_minutes, 15)));
  v_expires timestamptz;
  v_item jsonb;
  v_pid text;
  v_color text;
  v_size text;
  v_qty integer;
  v_note_text text;
  v_note jsonb;
  v_variants jsonb;
  v_variant jsonb;
  v_idx integer;
  v_stock integer;
  v_others integer;
  v_available integer;
  v_managed boolean;
  v_matched boolean;
  v_results jsonb := '[]'::jsonb;
  v_all_ok boolean := true;
  v_norm_req_color text;
  v_norm_req_size text;
begin
  if p_session_key is null or length(trim(p_session_key)) < 6 or length(trim(p_session_key)) > 80 then
    return jsonb_build_object('ok', false, 'error', 'sessionKey 없음');
  end if;

  v_expires := v_now + make_interval(mins => v_minutes);

  -- 교체 방식(멱등): 이 세션의 기존 선점 제거 후 현재 주문서 내용으로 다시 선점
  delete from public.cart_reservations where session_key = p_session_key;

  -- 상품 잠금 순서 고정(작은 id부터) → 교착 방지. 같은 상품 동시 담기는 여기서 도착순 직렬화됨.
  for v_pid in
    select distinct (i->>'productId')
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
    where coalesce(trim(i->>'productId'), '') <> ''
    order by 1
  loop
    -- 상품 행 잠금 (id 타입 무관하게 text 비교)
    select p.product_note into v_note_text
    from public.products p
    where p.id::text = v_pid
    for update;

    v_managed := false;
    v_variants := null;
    if found and v_note_text is not null then
      begin
        v_note := v_note_text::jsonb;
      exception when others then
        v_note := null;
      end;
      if v_note is not null
         and lower(coalesce(v_note->>'stock_management_enabled','false')) in ('true','t','1','yes','y')
         and jsonb_typeof(v_note->'stock_variants') = 'array' then
        v_managed := true;
        v_variants := v_note->'stock_variants';
      end if;
    end if;

    -- 이 상품의 요청 항목들 처리
    for v_item in
      select i from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
      where coalesce(trim(i->>'productId'), '') = v_pid
    loop
      v_color := left(coalesce(trim(v_item->>'color'), ''), 60);
      v_size  := left(coalesce(trim(v_item->>'size'), ''), 60);
      if v_color = '없음' then v_color := ''; end if;
      if v_size  = '없음' then v_size  := ''; end if;
      v_qty := least(99, greatest(0, coalesce((v_item->>'qty')::integer, 0)));
      if v_qty <= 0 then continue; end if;

      v_available := null;

      if v_managed then
        -- 옵션 재고 찾기 (제출 RPC와 동일한 '없음'/'' 동치 규칙)
        v_matched := false;
        for v_idx in 0..jsonb_array_length(v_variants)-1
        loop
          v_variant := v_variants->v_idx;
          v_norm_req_color := case when coalesce(trim(v_variant->>'color'),'') = '없음' then '' else coalesce(trim(v_variant->>'color'),'') end;
          v_norm_req_size  := case when coalesce(trim(v_variant->>'size'),'')  = '없음' then '' else coalesce(trim(v_variant->>'size'),'')  end;
          if v_norm_req_color = v_color and v_norm_req_size = v_size then
            v_stock := coalesce((v_variant->>'stock')::integer, 0);
            v_matched := true;
            exit;
          end if;
        end loop;

        if v_matched then
          -- 다른 세션(=다른 손님)의 유효 선점 합계. 만료된 선점은 자동 제외 = 즉시 복귀
          select coalesce(sum(r.qty), 0) into v_others
          from public.cart_reservations r
          where r.product_id = v_pid
            and r.session_key <> p_session_key
            and r.expires_at > v_now
            and (case when coalesce(trim(r.color),'') = '없음' then '' else coalesce(trim(r.color),'') end) = v_color
            and (case when coalesce(trim(r.size),'')  = '없음' then '' else coalesce(trim(r.size),'')  end) = v_size;

          v_available := greatest(0, v_stock - v_others);

          if v_qty > v_available then
            -- ❌ 선착순에서 밀림 — 담기 거부 (남은 수량 안내)
            v_all_ok := false;
            v_results := v_results || jsonb_build_object(
              'productId', v_pid, 'color', v_color, 'size', v_size,
              'requested', v_qty, 'ok', false, 'available', v_available);
            continue;
          end if;
        end if;
      end if;

      -- ✅ 선점 확정
      insert into public.cart_reservations
        (session_key, customer_phone, nickname, customer_name, product_id, color, size, qty, expires_at)
      values
        (p_session_key,
         nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), ''),
         nullif(left(coalesce(trim(p_nickname),''),40), ''),
         nullif(left(coalesce(trim(p_customer_name),''),40), ''),
         v_pid, v_color, v_size, v_qty, v_expires);

      v_results := v_results || jsonb_build_object(
        'productId', v_pid, 'color', v_color, 'size', v_size,
        'requested', v_qty, 'ok', true, 'available', v_available);
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'allOk', v_all_ok, 'holdMinutes', v_minutes, 'results', v_results);
end;
$claim$;
  $ddl1$;
  execute 'drop function if exists public.submit_customer_order_with_points(jsonb, integer, text, text, text)';
  execute $ddl2$
create or replace function public.submit_customer_order_with_points(
  p_order_rows jsonb,
  p_point_use_amount integer default 0,
  p_customer_phone text default null,
  p_youtube_nickname text default null,
  p_customer_name text default null,
  p_session_key text default null
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
  v_others_hold integer;
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
              = (CASE WHEN coalesce(trim(coalesce(v_inv_row.color,'')),'') = '없음' THEN '' ELSE trim(coalesce(v_inv_row.color,'')) END)
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

$function$;
  $ddl2$;

  -- ===== T1~T9: 알로밴딩바지(55) 상세 시나리오 =====
  r := public.claim_cart_hold('sim-session-AAAAAA','01000000001','시뮬A','테스트A',
       '[{"productId":"55","color":"블랙","size":"M","qty":2}]'::jsonb, 15);
  perform public._sim_rec('T1 담기성공(AAA 블랙M 2개)','ok=true',(r->'results'->0->>'ok'),(r->'results'->0->>'ok')='true');

  r := public.claim_cart_hold('sim-session-BBBBBB','01000000002','시뮬B','테스트B',
       '[{"productId":"55","color":"블랙","size":"M","qty":1}]'::jsonb, 15);
  perform public._sim_rec('T2 선착순거부(BBB 블랙M)','ok=false,avail=0',
       format('ok=%s,avail=%s',r->'results'->0->>'ok',r->'results'->0->>'available'),
       (r->'results'->0->>'ok')='false' and (r->'results'->0->>'available')='0');

  r := public.claim_cart_hold('sim-session-BBBBBB','01000000002','시뮬B','테스트B',
       '[{"productId":"55","color":"블랙","size":"S","qty":1}]'::jsonb, 15);
  perform public._sim_rec('T3 품절옵션거부(블랙S)','ok=false',(r->'results'->0->>'ok'),(r->'results'->0->>'ok')='false');

  r := public.claim_cart_hold('sim-session-AAAAAA','01000000001','시뮬A','테스트A',
       '[{"productId":"55","color":"블랙","size":"M","qty":1}]'::jsonb, 15);
  perform public._sim_rec('T4 본인수량조정(2→1)','ok=true',(r->'results'->0->>'ok'),(r->'results'->0->>'ok')='true');

  r := public.claim_cart_hold('sim-session-BBBBBB','01000000002','시뮬B','테스트B',
       '[{"productId":"55","color":"블랙","size":"M","qty":1}]'::jsonb, 15);
  perform public._sim_rec('T5 해제분재담기(BBB)','ok=true',(r->'results'->0->>'ok'),(r->'results'->0->>'ok')='true');

  rows1 := jsonb_build_array(jsonb_build_object(
    'order_group_id', g1, 'product_id','55','product_name','알로밴딩바지(2컬러)',
    'color','블랙','size','M','qty','1','product_price','40000',
    'total_price','40000','payment_method','무통장',
    'is_test_order','true','test_order_reason','시뮬레이션'));
  begin
    r2 := public.submit_customer_order_with_points(rows1,0,'01000000003','시뮬C','테스트C','sim-session-CCCCCC');
    perform public._sim_rec('T6 제출차단(남의선점보호)','재고부족 예외','통과됨(문제!)',false);
  exception when others then
    perform public._sim_rec('T6 제출차단(남의선점보호)','재고부족 예외',left(SQLERRM,50),SQLERRM like '%재고가 부족합니다%');
  end;

  begin
    r2 := public.submit_customer_order_with_points(rows1,0,'01000000002','시뮬B','테스트B','sim-session-BBBBBB');
    select count(*) into v_cnt from cart_reservations where session_key='sim-session-BBBBBB';
    select (v->>'stock')::int into v_stock
      from products p, jsonb_array_elements((p.product_note::jsonb)->'stock_variants') v
      where p.id=55 and trim(v->>'color')='블랙' and trim(v->>'size')='M';
    perform public._sim_rec('T7 정상제출(BBB 본인선점)','ok+선점해제+재고2→1',
       format('ok=%s,선점=%s,재고=%s',r2->>'ok',v_cnt,v_stock),
       (r2->>'ok')='true' and v_cnt=0 and v_stock=1);
  exception when others then
    perform public._sim_rec('T7 정상제출(BBB 본인선점)','성공',left(SQLERRM,50),false);
  end;

  update cart_reservations set expires_at = now() - interval '1 minute'
    where session_key='sim-session-AAAAAA';
  r := public.claim_cart_hold('sim-session-CCCCCC','01000000003','시뮬C','테스트C',
       '[{"productId":"55","color":"블랙","size":"M","qty":1}]'::jsonb, 15);
  perform public._sim_rec('T8 만료즉시복귀(CCC담기)','ok=true',(r->'results'->0->>'ok'),(r->'results'->0->>'ok')='true');

  begin
    r2 := public.submit_customer_order_with_points(rows1,0,'01000000002','시뮬B','테스트B','sim-session-BBBBBB');
    perform public._sim_rec('T9 중복제출방지 유지','duplicate=true',format('duplicate=%s',r2->>'duplicate'),(r2->>'duplicate')='true');
  exception when others then
    perform public._sim_rec('T9 중복제출방지 유지','duplicate=true',left(SQLERRM,50),false);
  end;

  -- ===== T10: 재고관리 켜진 상품 전수(최대 8개) 자동 검증 =====
  for v_p in
    select p.id::text as pid, p.product_name, p.product_note
    from products p
    where p.product_note like '%stock_management_enabled%'
    order by p.id desc limit 60
  loop
    exit when v_n >= 8;
    begin v_note := v_p.product_note::jsonb; exception when others then continue; end;
    if lower(coalesce(v_note->>'stock_management_enabled','')) not in ('true','t','1','yes','y') then continue; end if;
    if jsonb_typeof(v_note->'stock_variants') <> 'array' then continue; end if;
    v_pickc := null; v_picks := null; v_pickq := null;
    for v_i in 0..jsonb_array_length(v_note->'stock_variants')-1 loop
      if coalesce((v_note->'stock_variants'->v_i->>'stock'),'') ~ '^[0-9]+$'
         and (v_note->'stock_variants'->v_i->>'stock')::int > 0 then
        v_pickc := coalesce(v_note->'stock_variants'->v_i->>'color','');
        v_picks := coalesce(v_note->'stock_variants'->v_i->>'size','');
        v_pickq := (v_note->'stock_variants'->v_i->>'stock')::int;
        exit;
      end if;
    end loop;
    if v_pickq is null then continue; end if;
    v_n := v_n + 1;

    r := public.claim_cart_hold('sim-mA-'||v_n,'01000000011','멀티A','멀티A',
         jsonb_build_array(jsonb_build_object('productId',v_p.pid,'color',v_pickc,'size',v_picks,'qty',v_pickq)),15);
    ok1 := (r->'results'->0->>'ok')='true';
    r := public.claim_cart_hold('sim-mB-'||v_n,'01000000012','멀티B','멀티B',
         jsonb_build_array(jsonb_build_object('productId',v_p.pid,'color',v_pickc,'size',v_picks,'qty',1)),15);
    ok2 := (r->'results'->0->>'ok')='false';
    r := public.claim_cart_hold('sim-mA-'||v_n,'01000000011','멀티A','멀티A','[]'::jsonb,15);
    r := public.claim_cart_hold('sim-mB-'||v_n,'01000000012','멀티B','멀티B',
         jsonb_build_array(jsonb_build_object('productId',v_p.pid,'color',v_pickc,'size',v_picks,'qty',1)),15);
    ok3 := (r->'results'->0->>'ok')='true';

    perform public._sim_rec(format('T10-%s [%s] %s/%s 재고%s', v_n, left(v_p.product_name,12),
                coalesce(nullif(v_pickc,''),'-'), coalesce(nullif(v_picks,''),'-'), v_pickq),
        '전량담기/거부/복귀', format('담기=%s/거부=%s/복귀=%s',ok1,ok2,ok3), ok1 and ok2 and ok3);

    if v_n = 1 then v_pid1 := v_p.pid; v_c1 := v_pickc; v_s1 := v_picks; end if;
    if v_n = 2 then v_pid2 := v_p.pid; v_c2 := v_pickc; v_s2 := v_picks; end if;
  end loop;

  if v_n >= 2 then
    r := public.claim_cart_hold('sim-mC','01000000013','멀티C','멀티C',
         jsonb_build_array(
           jsonb_build_object('productId',v_pid1,'color',v_c1,'size',v_s1,'qty',1),
           jsonb_build_object('productId',v_pid2,'color',v_c2,'size',v_s2,'qty',1)),15);
    perform public._sim_rec('T11 두 상품 동시담기','둘 다 ok',
        format('%s,%s',r->'results'->0->>'ok',r->'results'->1->>'ok'),
        (r->'results'->0->>'ok')='true' and (r->'results'->1->>'ok')='true');
  end if;

  -- ===== 결과 출력 + 전체 롤백 (의도된 예외) =====
  raise exception E'\n════════ 시뮬레이션 결과 (아래는 에러가 아니라 결과표입니다 · 전부 자동 롤백됨) ════════\n%',
    (select string_agg(line, E'\n' order by seq) from _sim_report);
end $outer$;
