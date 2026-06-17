-- supabase/sql/admin_delete_order_item_rpc.sql
-- 목적: 관리자 주문상세에서 주문내역의 상품 1줄 삭제 (#3 2단계).
--   - 등록상품(재고 차감완료): 재고를 먼저 복구(admin_update_inventory_linked_order_item 복구부와 동일 패턴) 후 행 삭제.
--   - 직접입력(product_id 없음) 또는 재고 미차감: 그냥 행 삭제.
-- 안전 가드:
--   - 그룹에 상품이 1개뿐이면 개별 삭제 금지(주문 전체 취소를 쓰도록) → 빈 주문 방지.
--   - 포인트 사용된 항목은 개별 삭제 금지(포인트 복구 정합 위해 주문취소 사용).
-- FK 확인됨: order_items(CASCADE)/order_money_edit_logs(CASCADE)/order_status_change_logs(SET NULL) → 하드 DELETE 안전.
--   inventory_ledger 는 orders FK 없음 → 복구 기록은 감사용으로 유지됨.
-- 입금내역/정산 로직 무변경. DELETE는 orders UPDATE 트리거(포인트 적립/회수)와 무관.
-- 적용: Supabase SQL Editor에 붙여넣고 Run.

create or replace function public.admin_delete_order_item(
  p_order_id bigint,
  p_admin_memo text default 'admin-live 주문상품 삭제'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamptz := now();
  v_order public.orders%rowtype;
  v_group_count integer;
  v_color text;
  v_size text;
  v_qty integer;
  v_status text;
  v_variant_id bigint;
  v_before integer;
  v_after integer;
  v_restore_ledger uuid;
begin
  if p_order_id is null or p_order_id <= 0 then
    raise exception '삭제할 주문 ID가 없습니다.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception '주문 행을 찾을 수 없습니다: %', p_order_id; end if;

  -- 가드1: 그룹에 행이 1개뿐이면 개별 삭제 금지
  if coalesce(v_order.order_group_id, '') <> '' then
    select count(*) into v_group_count from public.orders where order_group_id = v_order.order_group_id;
    if v_group_count <= 1 then
      raise exception '주문에 상품이 1개뿐입니다. 개별 삭제 대신 주문 전체 취소를 사용하세요.';
    end if;
  end if;

  -- 가드2: 포인트 사용 항목은 개별 삭제 금지
  if coalesce(v_order.point_used_amount, 0) > 0 then
    raise exception '포인트가 사용된 상품은 개별 삭제할 수 없습니다. 주문취소를 사용하세요.';
  end if;

  v_status := coalesce(v_order.inventory_deduction_status, '');
  v_qty := greatest(0, coalesce(v_order.qty, 0));

  -- 등록상품 + 차감완료 + 미복구이면 재고 복구
  if v_order.product_id is not null
     and v_status in ('deducted_total', 'deducted_option')
     and v_order.inventory_restored_at is null
     and coalesce(v_order.inventory_restore_status, '') not in ('restored_total', 'restored_option')
     and v_qty > 0
  then
    v_color := trim(coalesce(v_order.color, ''));
    v_size := trim(coalesce(v_order.size, ''));
    if v_color in ('없음','선택안함','-','none','NONE','None') then v_color := ''; end if;
    if v_size in ('없음','선택안함','-','none','NONE','None') then v_size := ''; end if;

    if v_status = 'deducted_option' then
      insert into public.product_inventory_variants (product_id, color, size, stock)
        values (v_order.product_id, v_color, v_size, 0)
        on conflict (product_id, color, size) do nothing;
      select id, stock into v_variant_id, v_before
        from public.product_inventory_variants
        where product_id = v_order.product_id and color = v_color and size = v_size for update;
      if not found then
        raise exception '복구할 옵션재고를 찾을 수 없습니다. 상품 %, 옵션 % / %', v_order.product_id, v_color, v_size;
      end if;
      v_after := coalesce(v_before, 0) + v_qty;
      update public.product_inventory_variants set stock = v_after, updated_at = v_now where id = v_variant_id;
      insert into public.inventory_ledger (product_id,color,size,change_qty,reason,order_id,order_group_id,before_stock,after_stock,memo)
        values (v_order.product_id, v_color, v_size, v_qty, 'admin_order_item_delete_restore', v_order.id, v_order.order_group_id, coalesce(v_before,0), v_after, '주문상품 삭제: 옵션재고 복구')
        returning id into v_restore_ledger;
      perform public.ruru_sync_product_stock_note_from_variants(v_order.product_id);
    else
      select coalesce(stock, 0) into v_before from public.products where id = v_order.product_id for update;
      if not found then raise exception '상품 정보를 찾을 수 없습니다: %', v_order.product_id; end if;
      v_after := coalesce(v_before, 0) + v_qty;
      update public.products set stock = v_after, is_soldout = v_after <= 0 where id = v_order.product_id;
      insert into public.inventory_ledger (product_id,color,size,change_qty,reason,order_id,order_group_id,before_stock,after_stock,memo)
        values (v_order.product_id, null, null, v_qty, 'admin_order_item_delete_restore', v_order.id, v_order.order_group_id, coalesce(v_before,0), v_after, '주문상품 삭제: 총재고 복구')
        returning id into v_restore_ledger;
    end if;
  end if;

  -- 주문 행 삭제 (FK CASCADE/SET NULL 안전)
  delete from public.orders where id = v_order.id;

  return jsonb_build_object(
    'ok', true,
    'mode', 'admin_delete_order_item',
    'order_id', p_order_id,
    'restored', v_restore_ledger is not null,
    'restore_ledger_id', v_restore_ledger,
    'product_id', v_order.product_id,
    'qty', v_qty
  );
end;
$function$;
