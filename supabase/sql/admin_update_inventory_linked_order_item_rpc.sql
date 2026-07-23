-- supabase/sql/admin_update_inventory_linked_order_item_rpc.sql
-- 목적: 관리자 주문상세 "재고연동 상품수정" RPC.
--   배포 DB에만 있고 repo에 없던 함수를 동기화 + 최소 수정 2건 반영.
--
-- ⚠️ 이 파일은 배포 DB의 실제 함수 본문(pg_get_functiondef)을 그대로 가져와
--    아래 2군데만 고친 것입니다. 재고복구/재차감/금액계산/이력 로직은 무변경.
--
-- [수정1] 게이트에 'deducted'(총칭) 허용 추가.
--   - 배포된 주문제출 함수가 재고차감 상태를 'deducted'(총칭)로 저장 중(122건).
--     기존 게이트는 'deducted_total'/'deducted_option'만 허용 → 고객주문 대부분 수정 불가였음.
-- [수정2] v_old_status 가 'deducted'면 상품 옵션설정 기준으로 복구경로(옵션/총재고) 확정.
--   - 제출 차감 로직(stock_mode='option' 또는 옵션변형 존재 시 옵션차감)과 동일 기준으로 결정.
--   - 이후 단계(기존 복구/재차감/상태기록)는 'deducted_option'/'deducted_total'로 정상 동작.
--   - 수정 1회 후 그 주문의 inventory_deduction_status 는 정상값으로 자동 치유됨.
--
-- 적용: Supabase SQL Editor 에 붙여넣고 Run. (커밋만으로는 적용 안 됨)

CREATE OR REPLACE FUNCTION public.admin_update_inventory_linked_order_item(p_order_id bigint, p_product_name text, p_color text DEFAULT ''::text, p_size text DEFAULT ''::text, p_qty integer DEFAULT 1, p_unit_price integer DEFAULT 0, p_admin_memo text DEFAULT 'admin-live 재고연동 상품수정'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
  v_order public.orders%rowtype;
  v_product_name text := left(trim(coalesce(p_product_name, '')), 300);
  v_new_color text := trim(coalesce(p_color, ''));
  v_new_size text := trim(coalesce(p_size, ''));
  v_new_qty integer := greatest(0, coalesce(p_qty, 0));
  v_new_unit_price integer := greatest(0, coalesce(p_unit_price, 0));
  v_new_product_total integer;
  v_new_total integer;
  v_shipping_fee integer;
  v_card_extra integer;
  v_old_color text;
  v_old_size text;
  v_old_qty integer;
  v_old_status text;
  v_old_product_id bigint;
  v_product_note_text text;
  v_product_note jsonb;
  v_stock_management_enabled boolean;
  v_stock_mode text;
  v_has_option_variants boolean;
  v_variant_id bigint;
  v_before_stock integer;
  v_after_stock integer;
  v_restore_ledger_id uuid;
  v_deduct_ledger_id uuid;
  v_next_inventory_status text;
  v_next_inventory_memo text;
  v_history jsonb;
  v_history_entry jsonb;
  v_product_changed boolean;
  v_amount_changed boolean;
begin
  if p_order_id is null or p_order_id <= 0 then
    raise exception '수정할 주문 ID가 없습니다.';
  end if;
  if v_product_name = '' then
    raise exception '상품명을 입력해주세요.';
  end if;
  if v_new_qty <= 0 then
    raise exception '수량은 1개 이상이어야 합니다.';
  end if;
  -- [2026-07-23 사장님 지침] 선물(0원) 처리 허용 — 음수만 차단.
  --   (v_new_unit_price는 위에서 greatest(0,...) 클램프라 이 가드는 방어용.
  --    금액 재계산·final_amount·재고 복구/재차감 로직은 0원에서도 동일하게 안전: total = 0×qty + 배송비 + 카드수수료)
  if v_new_unit_price < 0 then
    raise exception '판매단가는 0원 이상이어야 합니다.';
  end if;
  if v_new_color in ('없음', '선택안함', '-', 'none', 'NONE', 'None') then
    v_new_color := '';
  end if;
  if v_new_size in ('없음', '선택안함', '-', 'none', 'NONE', 'None') then
    v_new_size := '';
  end if;
  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception '주문을 찾을 수 없습니다. 주문번호: %', p_order_id;
  end if;
  if coalesce(v_order.order_manage_status, '') ~* '취소|환불|cancel|refund'
    or coalesce(v_order.admin_order_status_v2, '') ~* '취소|환불|cancel|refund'
    or coalesce(v_order.order_status, '') ~* '취소|환불|cancel|refund'
    or coalesce(v_order.admin_status, '') ~* '취소|환불|cancel|refund'
  then
    raise exception '취소/환불 상태 주문은 재고연동 상품수정을 할 수 없습니다.';
  end if;
  if v_order.product_id is null then
    raise exception '직접입력 상품 또는 product_id 없는 주문은 이 RPC로 수정할 수 없습니다.';
  end if;
  -- [수정1] 'deducted'(총칭) 허용 추가
  if coalesce(v_order.inventory_deduction_status, '') not in ('deducted_total', 'deducted_option', 'deducted')
    or v_order.inventory_deducted_at is null
  then
    raise exception '재고차감완료 주문만 재고연동 상품수정이 가능합니다. 현재상태: %',
      coalesce(v_order.inventory_deduction_status, '없음');
  end if;
  if v_order.inventory_restored_at is not null
    or v_order.inventory_restore_ledger_id is not null
    or coalesce(v_order.inventory_restore_status, '') in ('restored_total', 'restored_option')
  then
    raise exception '이미 재고복구된 주문은 재고연동 상품수정을 할 수 없습니다.';
  end if;
  v_old_product_id := v_order.product_id;
  v_old_qty := greatest(0, coalesce(v_order.qty, 0));
  v_old_status := coalesce(v_order.inventory_deduction_status, '');
  if v_old_qty <= 0 then
    raise exception '기존 주문 수량이 0 이하라 재고연동 수정이 불가합니다.';
  end if;
  v_old_color := trim(coalesce(v_order.color, ''));
  v_old_size := trim(coalesce(v_order.size, ''));
  if v_old_color in ('없음', '선택안함', '-', 'none', 'NONE', 'None') then
    v_old_color := '';
  end if;
  if v_old_size in ('없음', '선택안함', '-', 'none', 'NONE', 'None') then
    v_old_size := '';
  end if;
  -- [수정2] 'deducted'(총칭)면 상품 옵션설정 기준으로 복구경로(옵션/총재고) 확정.
  --   제출 차감 로직과 동일 기준(stock_mode='option' 또는 옵션변형 존재 → 옵션).
  --   v_product_note_text/v_product_note/v_stock_mode/v_has_option_variants 는
  --   아래 2)단계에서 어차피 재조회되므로 여기서 임시로 써도 무방.
  if v_old_status = 'deducted' then
    select product_note
      into v_product_note_text
    from public.products
    where id = v_old_product_id;
    v_product_note := public.ruru_try_parse_jsonb(v_product_note_text);
    v_stock_mode := lower(coalesce(nullif(v_product_note->>'stock_mode', ''), 'total'));
    v_has_option_variants := jsonb_typeof(v_product_note->'stock_variants') = 'array'
      and jsonb_array_length(v_product_note->'stock_variants') > 0;
    if v_stock_mode = 'option' or v_has_option_variants then
      v_old_status := 'deducted_option';
    else
      v_old_status := 'deducted_total';
    end if;
  end if;
  v_product_changed :=
    trim(coalesce(v_order.product_name, '')) <> v_product_name
    or v_old_color <> v_new_color
    or v_old_size <> v_new_size
    or coalesce(v_order.qty, 0) <> v_new_qty;
  v_new_product_total := v_new_qty * v_new_unit_price;
  v_shipping_fee := coalesce(v_order.adjusted_shipping_fee, v_order.shipping_fee, 0)::integer;
  v_card_extra := coalesce(v_order.vat_amount, 0)::integer;
  v_new_total := v_new_product_total + v_shipping_fee + v_card_extra;
  v_amount_changed :=
    coalesce(v_order.product_price, 0) <> v_new_unit_price
    or coalesce(v_order.adjusted_product_price, 0)::integer <> v_new_product_total
    or coalesce(v_order.adjusted_total_price, v_order.total_price, 0)::integer <> v_new_total;
  if not v_product_changed and not v_amount_changed then
    return jsonb_build_object(
      'ok', true,
      'mode', 'no_change',
      'order_id', p_order_id,
      'message', '변경된 내용이 없습니다.'
    );
  end if;
  ----------------------------------------------------------------------
  -- 1) 기존 재고 차감분 복구
  ----------------------------------------------------------------------
  if v_old_status = 'deducted_option' then
    insert into public.product_inventory_variants (
      product_id,
      color,
      size,
      stock
    )
    values (
      v_old_product_id,
      v_old_color,
      v_old_size,
      0
    )
    on conflict (product_id, color, size) do nothing;
    select id, stock
      into v_variant_id, v_before_stock
    from public.product_inventory_variants
    where product_id = v_old_product_id
      and color = v_old_color
      and size = v_old_size
    for update;
    if not found then
      raise exception '기존 옵션 재고를 찾을 수 없습니다. 상품번호 %, 옵션 % / %',
        v_old_product_id, v_old_color, v_old_size;
    end if;
    v_after_stock := coalesce(v_before_stock, 0) + v_old_qty;
    update public.product_inventory_variants
      set
        stock = v_after_stock,
        updated_at = v_now
    where id = v_variant_id;
    insert into public.inventory_ledger (
      product_id,
      color,
      size,
      change_qty,
      reason,
      order_id,
      order_group_id,
      before_stock,
      after_stock,
      memo
    )
    values (
      v_old_product_id,
      v_old_color,
      v_old_size,
      v_old_qty,
      'admin_order_item_edit_restore_old',
      v_order.id,
      v_order.order_group_id,
      coalesce(v_before_stock, 0),
      v_after_stock,
      '재고연동 상품수정: 기존 옵션재고 복구'
    )
    returning id into v_restore_ledger_id;
    perform public.ruru_sync_product_stock_note_from_variants(v_old_product_id);
  elsif v_old_status = 'deducted_total' then
    select coalesce(stock, 0)
      into v_before_stock
    from public.products
    where id = v_old_product_id
    for update;
    if not found then
      raise exception '기존 상품 정보를 찾을 수 없습니다. 상품번호: %', v_old_product_id;
    end if;
    v_after_stock := coalesce(v_before_stock, 0) + v_old_qty;
    update public.products
      set
        stock = v_after_stock,
        is_soldout = v_after_stock <= 0
    where id = v_old_product_id;
    insert into public.inventory_ledger (
      product_id,
      color,
      size,
      change_qty,
      reason,
      order_id,
      order_group_id,
      before_stock,
      after_stock,
      memo
    )
    values (
      v_old_product_id,
      null,
      null,
      v_old_qty,
      'admin_order_item_edit_restore_old',
      v_order.id,
      v_order.order_group_id,
      coalesce(v_before_stock, 0),
      v_after_stock,
      '재고연동 상품수정: 기존 총재고 복구'
    )
    returning id into v_restore_ledger_id;
  else
    raise exception '지원하지 않는 기존 재고상태입니다. 현재상태: %', v_old_status;
  end if;
  ----------------------------------------------------------------------
  -- 2) 새 상품/옵션/수량 기준 재고 재차감
  -- 현재 1차 버전은 기존 product_id를 유지합니다.
  ----------------------------------------------------------------------
  select
    product_note,
    coalesce(stock, 0)
    into
    v_product_note_text,
    v_before_stock
  from public.products
  where id = v_old_product_id
  for update;
  if not found then
    raise exception '상품 정보를 찾을 수 없습니다. 상품번호: %', v_old_product_id;
  end if;
  v_product_note := public.ruru_try_parse_jsonb(v_product_note_text);
  v_stock_management_enabled := not (
    lower(coalesce(v_product_note->>'stock_management_enabled', 'true')) in ('false', 'f', '0', 'no', 'n')
  );
  if not v_stock_management_enabled then
    raise exception '현재 상품이 재고관리 OFF 상태라 재고연동 상품수정이 불가합니다.';
  end if;
  v_stock_mode := lower(coalesce(nullif(v_product_note->>'stock_mode', ''), 'total'));
  v_has_option_variants := jsonb_typeof(v_product_note->'stock_variants') = 'array'
    and jsonb_array_length(v_product_note->'stock_variants') > 0;
  if v_stock_mode = 'option' or v_has_option_variants then
    insert into public.product_inventory_variants (
      product_id,
      color,
      size,
      stock
    )
    select
      v_old_product_id,
      trim(coalesce(variant_row.value->>'color', '')),
      trim(coalesce(variant_row.value->>'size', '')),
      greatest(
        0,
        case
          when coalesce(variant_row.value->>'stock', '') ~ '^[0-9]+$'
            then (variant_row.value->>'stock')::integer
          else 0
        end
      )
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_product_note->'stock_variants') = 'array'
          then v_product_note->'stock_variants'
        else '[]'::jsonb
      end
    ) as variant_row(value)
    on conflict (product_id, color, size) do nothing;
    select id, stock
      into v_variant_id, v_before_stock
    from public.product_inventory_variants
    where product_id = v_old_product_id
      and color = v_new_color
      and size = v_new_size
    for update;
    if not found then
      raise exception '새 옵션 재고를 찾을 수 없습니다. 상품번호 %, 옵션 % / %',
        v_old_product_id, v_new_color, v_new_size;
    end if;
    if coalesce(v_before_stock, 0) < v_new_qty then
      raise exception '재고가 부족합니다. 상품번호 %, 옵션 % / %, 현재재고 %, 요청수량 %',
        v_old_product_id, v_new_color, v_new_size, coalesce(v_before_stock, 0), v_new_qty;
    end if;
    v_after_stock := coalesce(v_before_stock, 0) - v_new_qty;
    update public.product_inventory_variants
      set
        stock = v_after_stock,
        updated_at = v_now
    where id = v_variant_id;
    insert into public.inventory_ledger (
      product_id,
      color,
      size,
      change_qty,
      reason,
      order_id,
      order_group_id,
      before_stock,
      after_stock,
      memo
    )
    values (
      v_old_product_id,
      v_new_color,
      v_new_size,
      -v_new_qty,
      'admin_order_item_edit_deduct_new',
      v_order.id,
      v_order.order_group_id,
      coalesce(v_before_stock, 0),
      v_after_stock,
      '재고연동 상품수정: 새 옵션재고 차감'
    )
    returning id into v_deduct_ledger_id;
    perform public.ruru_sync_product_stock_note_from_variants(v_old_product_id);
    v_next_inventory_status := 'deducted_option';
    v_next_inventory_memo := '재고연동 상품수정: 기존 재고 복구 후 새 옵션재고 차감';
  else
    if coalesce(v_before_stock, 0) < v_new_qty then
      raise exception '재고가 부족합니다. 상품번호 %, 현재재고 %, 요청수량 %',
        v_old_product_id, coalesce(v_before_stock, 0), v_new_qty;
    end if;
    v_after_stock := coalesce(v_before_stock, 0) - v_new_qty;
    update public.products
      set
        stock = v_after_stock,
        is_soldout = v_after_stock <= 0
    where id = v_old_product_id;
    insert into public.inventory_ledger (
      product_id,
      color,
      size,
      change_qty,
      reason,
      order_id,
      order_group_id,
      before_stock,
      after_stock,
      memo
    )
    values (
      v_old_product_id,
      null,
      null,
      -v_new_qty,
      'admin_order_item_edit_deduct_new',
      v_order.id,
      v_order.order_group_id,
      coalesce(v_before_stock, 0),
      v_after_stock,
      '재고연동 상품수정: 새 총재고 차감'
    )
    returning id into v_deduct_ledger_id;
    v_next_inventory_status := 'deducted_total';
    v_next_inventory_memo := '재고연동 상품수정: 기존 재고 복구 후 새 총재고 차감';
  end if;
  ----------------------------------------------------------------------
  -- 3) 주문값/이력/재고상태 갱신
  ----------------------------------------------------------------------
  v_history :=
    case
      when jsonb_typeof(coalesce(v_order.item_change_history, '[]'::jsonb)) = 'array'
        then coalesce(v_order.item_change_history, '[]'::jsonb)
      else '[]'::jsonb
    end;
  v_history_entry := jsonb_build_object(
    'changed_at', v_now,
    'source', 'admin-live-inventory-linked-order-edit-rpc',
    'row_id', v_order.id,
    'product_changed', v_product_changed,
    'amount_changed', v_amount_changed,
    'inventory_changed', true,
    'restore_ledger_id', v_restore_ledger_id,
    'deduct_ledger_id', v_deduct_ledger_id,
    'admin_memo', coalesce(nullif(trim(p_admin_memo), ''), 'admin-live 재고연동 상품수정'),
    'before', jsonb_build_object(
      'product_id', v_order.product_id,
      'product_name', coalesce(v_order.product_name, ''),
      'color', coalesce(v_order.color, ''),
      'size', coalesce(v_order.size, ''),
      'qty', coalesce(v_order.qty, 0),
      'product_price', coalesce(v_order.product_price, 0),
      'adjusted_product_price', coalesce(v_order.adjusted_product_price, 0),
      'adjusted_total_price', coalesce(v_order.adjusted_total_price, v_order.total_price, 0),
      'inventory_deduction_status', coalesce(v_order.inventory_deduction_status, '')
    ),
    'after', jsonb_build_object(
      'product_id', v_old_product_id,
      'product_name', v_product_name,
      'color', v_new_color,
      'size', v_new_size,
      'qty', v_new_qty,
      'product_price', v_new_unit_price,
      'adjusted_product_price', v_new_product_total,
      'adjusted_total_price', v_new_total,
      'inventory_deduction_status', v_next_inventory_status
    )
  );
  update public.orders
    set
      product_name = v_product_name,
      color = v_new_color,
      size = v_new_size,
      qty = v_new_qty,
      product_price = v_new_unit_price,
      adjusted_product_price = v_new_product_total,
      adjusted_total_price = v_new_total,
      total_price = v_new_total,
      -- [수정3] 총금액(final_amount)은 이미 사용된 포인트를 뺀 실결제액으로 저장.
      --   주문 제출 RPC와 동일 기준(final_amount = 총액 - 사용포인트). 0 미만 클램프.
      --   point_used_amount 자체는 변경하지 않음(이미 차감된 포인트 그대로 유지).
      final_amount = case
        when v_order.final_amount is not null
          then greatest(0, v_new_total - coalesce(v_order.point_used_amount, 0))
        else v_order.final_amount
      end,
      memo = array_to_string(
        array_remove(array[v_product_name, v_new_color, v_new_size, 'x' || v_new_qty::text], ''),
        ' '
      ),
      item_change_history = v_history || jsonb_build_array(v_history_entry),
      inventory_deducted_at = v_now,
      inventory_ledger_id = v_deduct_ledger_id,
      inventory_deduction_status = v_next_inventory_status,
      inventory_deduction_memo = v_next_inventory_memo,
      inventory_restored_at = null,
      inventory_restore_ledger_id = null,
      inventory_restore_status = null,
      inventory_restore_memo = null
  where id = v_order.id;
  return jsonb_build_object(
    'ok', true,
    'mode', 'admin_update_inventory_linked_order_item',
    'order_id', v_order.id,
    'product_id', v_old_product_id,
    'product_changed', v_product_changed,
    'amount_changed', v_amount_changed,
    'old_inventory_status', v_old_status,
    'new_inventory_status', v_next_inventory_status,
    'restore_ledger_id', v_restore_ledger_id,
    'deduct_ledger_id', v_deduct_ledger_id,
    'qty_before', v_old_qty,
    'qty_after', v_new_qty,
    'product_total_after', v_new_product_total,
    'total_after', v_new_total
  );
end;
$function$;
