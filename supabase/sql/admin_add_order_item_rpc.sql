-- supabase/sql/admin_add_order_item_rpc.sql
-- 목적: 관리자 주문상세에서 기존 주문(그룹)에 상품 1줄 추가 (#3 2·3단계 공용).
--   - p_product_id NULL  → 직접입력 상품(재고 차감 없음)
--   - p_product_id 값있음 → 등록상품(재고관리 ON이면 옵션/총량 재고 차감, 부족하면 추가 안 됨)
-- 안전 원칙:
--   - 그룹 공유필드는 기준 행(첫 행)에서 복사 → 같은 order_group_id/주문자/주소/상태로 한 그룹 유지.
--   - 카드 vat = round(상품금액 × customer_card_extra_rate_applied/100) (그 주문 수수료율, submit route와 동일 공식).
--   - 택배비는 기존 행에 있으므로 추가 행은 0 (중복 방지).
--   - 재고 차감 로직은 admin_update_inventory_linked_order_item 의 '재차감' 부분과 동일 패턴.
--   - 입금내역/포인트차감/정산 로직 무변경. INSERT는 orders의 UPDATE 트리거(포인트)와 무관.
-- 적용: Supabase SQL Editor에 붙여넣고 Run (커밋만으론 미적용). ADD 함수만 생성, 기존 객체 변경 없음.

create or replace function public.admin_add_order_item(
  p_ref_order_id bigint,
  p_product_id bigint default null,
  p_product_name text default '',
  p_color text default '',
  p_size text default '',
  p_qty integer default 1,
  p_unit_price integer default 0,
  p_admin_memo text default 'admin-live 주문상품 추가'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamptz := now();
  v_ref public.orders%rowtype;
  v_name text := left(trim(coalesce(p_product_name, '')), 300);
  v_color text := trim(coalesce(p_color, ''));
  v_size text := trim(coalesce(p_size, ''));
  v_qty integer := greatest(0, coalesce(p_qty, 0));
  v_unit integer := greatest(0, coalesce(p_unit_price, 0));
  v_product_total integer;
  v_is_card boolean;
  v_card_extra integer;
  v_total integer;
  v_product_note jsonb;
  v_stock_mgmt boolean;
  v_stock_mode text;
  v_has_variants boolean;
  v_variant_id bigint;
  v_before integer;
  v_after integer;
  v_deduct_ledger uuid;
  v_inv_status text := null;
  v_inv_memo text := null;
  v_new_id bigint;
begin
  if p_ref_order_id is null or p_ref_order_id <= 0 then
    raise exception '기준 주문 ID가 없습니다.';
  end if;
  if v_name = '' then raise exception '상품명을 입력해주세요.'; end if;
  if v_qty <= 0 then raise exception '수량은 1개 이상이어야 합니다.'; end if;
  if v_unit <= 0 then raise exception '단가는 1원 이상이어야 합니다.'; end if;
  if v_color in ('없음','선택안함','-','none','NONE','None') then v_color := ''; end if;
  if v_size in ('없음','선택안함','-','none','NONE','None') then v_size := ''; end if;

  select * into v_ref from public.orders where id = p_ref_order_id for update;
  if not found then raise exception '기준 주문 행을 찾을 수 없습니다: %', p_ref_order_id; end if;

  v_product_total := v_qty * v_unit;
  v_is_card := coalesce(v_ref.payment_method, '') = '카드결제';
  v_card_extra := case when v_is_card
    then round(v_product_total * (coalesce(v_ref.customer_card_extra_rate_applied, 0) / 100.0))
    else 0 end;
  v_total := v_product_total + v_card_extra;

  -- 등록상품 + 재고관리 ON 이면 재고 차감
  if p_product_id is not null then
    select product_note into v_product_note
      from public.products where id = p_product_id for update;
    if not found then raise exception '상품 정보를 찾을 수 없습니다: %', p_product_id; end if;
    v_product_note := public.ruru_try_parse_jsonb(v_product_note::text);
    v_stock_mgmt := not (lower(coalesce(v_product_note->>'stock_management_enabled','true')) in ('false','f','0','no','n'));

    if v_stock_mgmt then
      v_stock_mode := lower(coalesce(nullif(v_product_note->>'stock_mode',''),'total'));
      v_has_variants := jsonb_typeof(v_product_note->'stock_variants')='array'
        and jsonb_array_length(v_product_note->'stock_variants') > 0;

      if v_stock_mode = 'option' or v_has_variants then
        insert into public.product_inventory_variants (product_id, color, size, stock)
        select p_product_id,
               trim(coalesce(vr.value->>'color','')),
               trim(coalesce(vr.value->>'size','')),
               greatest(0, case when coalesce(vr.value->>'stock','') ~ '^[0-9]+$' then (vr.value->>'stock')::int else 0 end)
        from jsonb_array_elements(
          case when jsonb_typeof(v_product_note->'stock_variants')='array' then v_product_note->'stock_variants' else '[]'::jsonb end
        ) as vr(value)
        on conflict (product_id, color, size) do nothing;

        select id, stock into v_variant_id, v_before
          from public.product_inventory_variants
          where product_id=p_product_id and color=v_color and size=v_size for update;
        if not found then
          raise exception '옵션 재고를 찾을 수 없습니다. 상품 %, 옵션 % / %', p_product_id, v_color, v_size;
        end if;
        if coalesce(v_before,0) < v_qty then
          raise exception '재고가 부족합니다. 상품 %, 옵션 % / %, 현재 %, 요청 %', p_product_id, v_color, v_size, coalesce(v_before,0), v_qty;
        end if;
        v_after := coalesce(v_before,0) - v_qty;
        update public.product_inventory_variants set stock=v_after, updated_at=v_now where id=v_variant_id;
        insert into public.inventory_ledger (product_id,color,size,change_qty,reason,order_id,order_group_id,before_stock,after_stock,memo)
          values (p_product_id, v_color, v_size, -v_qty, 'admin_order_item_add_deduct', null, v_ref.order_group_id, coalesce(v_before,0), v_after, '주문상품 추가: 옵션재고 차감')
          returning id into v_deduct_ledger;
        perform public.ruru_sync_product_stock_note_from_variants(p_product_id);
        v_inv_status := 'deducted_option';
        v_inv_memo := '주문상품 추가: 옵션재고 차감';
      else
        select coalesce(stock,0) into v_before from public.products where id=p_product_id for update;
        if coalesce(v_before,0) < v_qty then
          raise exception '재고가 부족합니다. 상품 %, 현재 %, 요청 %', p_product_id, coalesce(v_before,0), v_qty;
        end if;
        v_after := coalesce(v_before,0) - v_qty;
        update public.products set stock=v_after, is_soldout = v_after<=0 where id=p_product_id;
        insert into public.inventory_ledger (product_id,color,size,change_qty,reason,order_id,order_group_id,before_stock,after_stock,memo)
          values (p_product_id, null, null, -v_qty, 'admin_order_item_add_deduct', null, v_ref.order_group_id, coalesce(v_before,0), v_after, '주문상품 추가: 총재고 차감')
          returning id into v_deduct_ledger;
        v_inv_status := 'deducted_total';
        v_inv_memo := '주문상품 추가: 총재고 차감';
      end if;
    end if;
  end if;

  -- 새 orders 행 INSERT (그룹 공유필드 = 기준 행 복사)
  insert into public.orders (
    created_at, order_group_id, order_lookup_code, broadcast_id, broadcast_name,
    broadcast_public_title, broadcast_admin_subtitle, youtube_nickname,
    customer_name, customer_phone, phone, recipient_name, recipient_phone,
    zipcode, address, detail_address, request_memo, payment_method,
    customer_card_extra_rate_applied, actual_card_fee_rate_applied,
    order_status, admin_status, order_manage_status, admin_order_status_v2, shipping_status,
    is_test_order, test_order_reason, operator_test_phone,
    exclude_from_settlement, exclude_from_payment_match, exclude_from_shipping, exclude_from_picking,
    customer_id,
    product_id, product_name, color, size, qty,
    product_price, adjusted_product_price, shipping_fee, adjusted_shipping_fee,
    vat_amount, total_price, adjusted_total_price, final_amount, memo,
    point_used_amount, point_original_amount,
    inventory_deducted_at, inventory_ledger_id, inventory_deduction_status, inventory_deduction_memo
  ) values (
    v_ref.created_at, v_ref.order_group_id, v_ref.order_lookup_code, v_ref.broadcast_id, v_ref.broadcast_name,
    v_ref.broadcast_public_title, v_ref.broadcast_admin_subtitle, v_ref.youtube_nickname,
    v_ref.customer_name, v_ref.customer_phone, v_ref.phone, v_ref.recipient_name, v_ref.recipient_phone,
    v_ref.zipcode, v_ref.address, v_ref.detail_address, v_ref.request_memo, v_ref.payment_method,
    v_ref.customer_card_extra_rate_applied, v_ref.actual_card_fee_rate_applied,
    v_ref.order_status, v_ref.admin_status, v_ref.order_manage_status, v_ref.admin_order_status_v2, v_ref.shipping_status,
    v_ref.is_test_order, v_ref.test_order_reason, v_ref.operator_test_phone,
    v_ref.exclude_from_settlement, v_ref.exclude_from_payment_match, v_ref.exclude_from_shipping, v_ref.exclude_from_picking,
    v_ref.customer_id,
    p_product_id, v_name, nullif(v_color,''), nullif(v_size,''), v_qty,
    v_unit, v_product_total, 0, 0,
    v_card_extra, v_total, v_total, v_total,
    array_to_string(array_remove(array[v_name, v_color, v_size, 'x'||v_qty::text], ''), ' '),
    0, v_total,
    case when v_deduct_ledger is not null then v_now else null end,
    v_deduct_ledger, v_inv_status, v_inv_memo
  ) returning id into v_new_id;

  -- 차감 ledger의 order_id를 새 행으로 보정(추가 직후 새 id 확보)
  if v_deduct_ledger is not null then
    update public.inventory_ledger set order_id = v_new_id where id = v_deduct_ledger;
  end if;

  return jsonb_build_object(
    'ok', true,
    'mode', 'admin_add_order_item',
    'new_order_id', v_new_id,
    'product_id', p_product_id,
    'qty', v_qty,
    'product_total', v_product_total,
    'card_extra', v_card_extra,
    'total', v_total,
    'inventory_status', v_inv_status,
    'deduct_ledger_id', v_deduct_ledger
  );
end;
$function$;
