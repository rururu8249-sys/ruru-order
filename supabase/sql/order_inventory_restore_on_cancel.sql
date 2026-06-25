-- supabase/sql/order_inventory_restore_on_cancel.sql
-- 목적: 주문서 "자체 취소/복구" 시 재고를 정확히 되돌린다.
--   - 현재 cancel_order_and_restore_points 는 포인트만 복구하고 재고는 그대로라
--     취소된 주문이 재고를 영구 소모하는 문제가 있었음 → 이 신규 RPC로 보완.
--   - 기존 돈/포인트/취소 RPC(cancel_order_and_restore_points)는 일절 건드리지 않음.
--   - 검증된 복구 패턴(admin_delete_order_item_rpc.sql)을 그대로 따름.
--
-- 동작:
--   p_mode = 'restore'  (주문서 취소 시): 차감완료·미복구 행의 재고를 +qty 되돌리고 복구표시.
--   p_mode = 'deduct'   (주문서 복구=취소해제 시): 복구표시 행의 재고를 다시 -qty 차감(0 미만 클램프).
--   둘 다 멱등(restore는 이미 복구된 행 스킵 / deduct는 복구표시 아닌 행 스킵).
--
-- 안전:
--   - 등록상품(product_id 있음)·재고차감(deducted_*)된 행만 대상. 직접입력/재고관리OFF는 자동 스킵.
--   - 옵션재고 테이블 check(stock>=0) 위반 방지를 위해 deduct는 greatest(0, ...) 클램프.
--   - inventory_ledger 에 복구/재차감 이력 남김(감사용).
--   - 돈/입금/정산/포인트 컬럼은 건드리지 않음(재고 컬럼만).
--
-- 적용: Supabase SQL Editor 에 붙여넣고 Run. (커밋만으로는 적용 안 됨)

begin;

-- 복구 추적 컬럼(없으면 추가). ADD ONLY = 기존 데이터 보호.
alter table public.orders add column if not exists inventory_restore_status text;
alter table public.orders add column if not exists inventory_restored_at timestamptz;
alter table public.orders add column if not exists inventory_restore_memo text;
alter table public.orders add column if not exists inventory_restore_ledger_id uuid;

create or replace function public.restore_order_inventory(
  p_order_ids bigint[],
  p_mode text default 'restore'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now timestamptz := now();
  v_mode text := lower(coalesce(nullif(trim(p_mode), ''), 'restore'));
  v_id bigint;
  v_order public.orders%rowtype;
  v_status text;
  v_qty integer;
  v_color text;
  v_size text;
  v_variant_id bigint;
  v_before integer;
  v_after integer;
  v_delta integer;
  v_ledger uuid;
  v_restored_count integer := 0;
  v_rededucted_count integer := 0;
  v_skipped_count integer := 0;
begin
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    return jsonb_build_object('ok', true, 'mode', v_mode, 'restored_count', 0, 'rededucted_count', 0, 'skipped_count', 0);
  end if;

  if v_mode not in ('restore', 'deduct') then
    raise exception '잘못된 모드: % (restore 또는 deduct)', v_mode;
  end if;

  foreach v_id in array p_order_ids loop
    select * into v_order from public.orders where id = v_id for update;
    if not found then
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    v_status := coalesce(v_order.inventory_deduction_status, '');
    v_qty := greatest(0, coalesce(v_order.qty, 0));

    -- 등록상품 + 차감완료 + 수량>0 만 대상
    if v_order.product_id is null
       or v_status not in ('deducted_total', 'deducted_option')
       or v_qty <= 0 then
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    v_color := trim(coalesce(v_order.color, ''));
    v_size := trim(coalesce(v_order.size, ''));
    if v_color in ('없음','선택안함','-','none','NONE','None') then v_color := ''; end if;
    if v_size in ('없음','선택안함','-','none','NONE','None') then v_size := ''; end if;

    if v_mode = 'restore' then
      -- 이미 복구된 행은 스킵(멱등)
      if v_order.inventory_restored_at is not null
         or coalesce(v_order.inventory_restore_status, '') in ('restored_total', 'restored_option') then
        v_skipped_count := v_skipped_count + 1;
        continue;
      end if;

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
          values (v_order.product_id, v_color, v_size, v_qty, 'order_cancel_restore', v_order.id, v_order.order_group_id, coalesce(v_before,0), v_after, '주문서취소 옵션재고 복구')
          returning id into v_ledger;
        perform public.ruru_sync_product_stock_note_from_variants(v_order.product_id);
      else
        select coalesce(stock, 0) into v_before from public.products where id = v_order.product_id for update;
        if not found then raise exception '상품 정보를 찾을 수 없습니다: %', v_order.product_id; end if;
        v_after := coalesce(v_before, 0) + v_qty;
        update public.products set stock = v_after, is_soldout = v_after <= 0 where id = v_order.product_id;
        insert into public.inventory_ledger (product_id,color,size,change_qty,reason,order_id,order_group_id,before_stock,after_stock,memo)
          values (v_order.product_id, null, null, v_qty, 'order_cancel_restore', v_order.id, v_order.order_group_id, coalesce(v_before,0), v_after, '주문서취소 총재고 복구')
          returning id into v_ledger;
      end if;

      update public.orders
        set inventory_restored_at = v_now,
            inventory_restore_status = case when v_status = 'deducted_option' then 'restored_option' else 'restored_total' end,
            inventory_restore_memo = '주문서취소 재고 복구',
            inventory_restore_ledger_id = v_ledger
        where id = v_order.id;

      v_restored_count := v_restored_count + 1;

    else
      -- deduct(취소해제 → 다시 차감): 복구표시된 행만 대상(멱등)
      if v_order.inventory_restored_at is null
         and coalesce(v_order.inventory_restore_status, '') not in ('restored_total', 'restored_option') then
        v_skipped_count := v_skipped_count + 1;
        continue;
      end if;

      if v_status = 'deducted_option' then
        insert into public.product_inventory_variants (product_id, color, size, stock)
          values (v_order.product_id, v_color, v_size, 0)
          on conflict (product_id, color, size) do nothing;
        select id, stock into v_variant_id, v_before
          from public.product_inventory_variants
          where product_id = v_order.product_id and color = v_color and size = v_size for update;
        if not found then
          raise exception '재차감할 옵션재고를 찾을 수 없습니다. 상품 %, 옵션 % / %', v_order.product_id, v_color, v_size;
        end if;
        v_after := greatest(0, coalesce(v_before, 0) - v_qty); -- check(stock>=0) 보호
        v_delta := v_after - coalesce(v_before, 0);
        update public.product_inventory_variants set stock = v_after, updated_at = v_now where id = v_variant_id;
        insert into public.inventory_ledger (product_id,color,size,change_qty,reason,order_id,order_group_id,before_stock,after_stock,memo)
          values (v_order.product_id, v_color, v_size, v_delta, 'order_uncancel_rededuct', v_order.id, v_order.order_group_id, coalesce(v_before,0), v_after, '주문서복구 옵션재고 재차감')
          returning id into v_ledger;
        perform public.ruru_sync_product_stock_note_from_variants(v_order.product_id);
      else
        select coalesce(stock, 0) into v_before from public.products where id = v_order.product_id for update;
        if not found then raise exception '상품 정보를 찾을 수 없습니다: %', v_order.product_id; end if;
        v_after := greatest(0, coalesce(v_before, 0) - v_qty);
        v_delta := v_after - coalesce(v_before, 0);
        update public.products set stock = v_after, is_soldout = v_after <= 0 where id = v_order.product_id;
        insert into public.inventory_ledger (product_id,color,size,change_qty,reason,order_id,order_group_id,before_stock,after_stock,memo)
          values (v_order.product_id, null, null, v_delta, 'order_uncancel_rededuct', v_order.id, v_order.order_group_id, coalesce(v_before,0), v_after, '주문서복구 총재고 재차감')
          returning id into v_ledger;
      end if;

      -- 복구표시 해제 → 다시 "차감완료" 상태로 되돌림(재취소 시 또 복구 가능)
      update public.orders
        set inventory_restored_at = null,
            inventory_restore_status = null,
            inventory_restore_memo = null,
            inventory_restore_ledger_id = null
        where id = v_order.id;

      v_rededucted_count := v_rededucted_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'mode', v_mode,
    'restored_count', v_restored_count,
    'rededucted_count', v_rededucted_count,
    'skipped_count', v_skipped_count
  );
end;
$function$;

comment on function public.restore_order_inventory(bigint[], text) is
  '주문서 취소/복구 시 재고를 되돌리거나 다시 차감하는 RPC. 기존 돈/포인트/취소 RPC와 분리. 멱등.';

commit;
