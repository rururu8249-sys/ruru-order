-- supabase/sql/admin_delete_order_item_rpc.sql
-- 목적: 관리자 주문상세에서 주문내역의 상품 1줄 삭제 (#3 2단계).
--   - 등록상품(재고 차감완료): 재고를 먼저 복구(admin_update_inventory_linked_order_item 복구부와 동일 패턴) 후 행 삭제.
--   - 직접입력(product_id 없음) 또는 재고 미차감: 그냥 행 삭제.
-- 안전 가드:
--   - 그룹에 상품이 1개뿐이면 개별 삭제 금지(주문 전체 취소를 쓰도록) → 빈 주문 방지.
--   - [2026-08-31 개선] 포인트 사용 행 삭제 허용: 포인트를 같은 그룹의 남는 행으로 옮긴 뒤 삭제.
--     · 그룹 포인트 합계 불변 → 최종결제금액 공식(final=총액−포인트)·자동입금매칭·주문취소 포인트환급 모두 정합 유지
--     · 옮겨 받을 행의 여유금액(행 총액−이미 쓴 포인트)이 부족하면만 차단(기존 안내 유지)
--     · 이미 포인트 환급된 행이면 옮길 것이 없으므로 그대로 삭제
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
  v_pts integer := 0;
  v_sib_id bigint;
  v_sib_total integer;
  v_sib_points integer;
  v_sib_headroom integer;
  v_point_moved integer := 0;
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

  -- [2026-08-31 개선] 포인트 사용 행: 포인트를 남는 행으로 이관 후 삭제 (그룹 포인트 합계 불변)
  v_pts := coalesce(v_order.point_used_amount, 0);
  if v_pts > 0
     and (coalesce(v_order.point_refunded_amount, 0) > 0
          or v_order.point_refund_ledger_id is not null
          or v_order.point_refunded_at is not null) then
    v_pts := 0; -- 이미 환급된 포인트 → 옮길 것 없음, 그대로 삭제 진행
  end if;
  if v_pts > 0 then
    if coalesce(v_order.order_group_id, '') = '' then
      raise exception '포인트가 사용된 상품은 개별 삭제할 수 없습니다. 주문취소를 사용하세요.';
    end if;
    -- 옮겨 받을 행: 여유금액(행 총액 − 이미 쓴 포인트)이 가장 큰 남는 행
    select o.id,
           coalesce(o.adjusted_total_price, o.total_price, 0),
           coalesce(o.point_used_amount, 0)
      into v_sib_id, v_sib_total, v_sib_points
      from public.orders o
      where o.order_group_id = v_order.order_group_id and o.id <> v_order.id
      order by greatest(0, coalesce(o.adjusted_total_price, o.total_price, 0) - coalesce(o.point_used_amount, 0)) desc, o.id asc
      limit 1
      for update;
    if v_sib_id is null then
      raise exception '포인트가 사용된 상품은 개별 삭제할 수 없습니다. 주문취소를 사용하세요.';
    end if;
    v_sib_headroom := greatest(0, coalesce(v_sib_total, 0) - coalesce(v_sib_points, 0));
    if v_sib_headroom < v_pts then
      raise exception '사용 포인트 %원을 옮겨 받을 다른 상품의 금액이 부족합니다. 주문취소를 사용하세요.', v_pts;
    end if;
    -- 이관: 포인트 사용액 합산 + final 재계산(정합 공식: final = 행총액 − 포인트). 잔액 스탬프는 비어있을 때만 복사.
    update public.orders o
      set point_used_amount = coalesce(o.point_used_amount, 0) + v_pts,
          final_amount = greatest(0, coalesce(o.adjusted_total_price, o.total_price, 0) - (coalesce(o.point_used_amount, 0) + v_pts)),
          point_original_amount = coalesce(o.point_original_amount, coalesce(o.adjusted_total_price, o.total_price, 0)),
          point_balance_before = coalesce(o.point_balance_before, v_order.point_balance_before),
          point_balance_after = coalesce(o.point_balance_after, v_order.point_balance_after),
          point_used_at = coalesce(o.point_used_at, v_order.point_used_at)
      where o.id = v_sib_id;
    v_point_moved := v_pts;
  end if;

  v_status := coalesce(v_order.inventory_deduction_status, '');
  v_qty := greatest(0, coalesce(v_order.qty, 0));

  -- [2026-07-25 수정1] 'deducted'(총칭) 허용 + [수정2] 상품 옵션설정으로 경로 확정.
  --   배포 제출 함수가 총칭으로 저장 → 기존 게이트에서 스킵되어 "항목 삭제해도 재고 미복구"였음
  --   (restore_order_inventory·상품수정 RPC와 동일 버그·동일 수정).
  if v_status = 'deducted' then
    declare
      v_note jsonb;
    begin
      select public.ruru_try_parse_jsonb(product_note) into v_note
      from public.products where id = v_order.product_id;
      if lower(coalesce(nullif(v_note->>'stock_mode', ''), 'total')) = 'option'
         or (jsonb_typeof(v_note->'stock_variants') = 'array' and jsonb_array_length(v_note->'stock_variants') > 0) then
        v_status := 'deducted_option';
      else
        v_status := 'deducted_total';
      end if;
    end;
  end if;

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
    'qty', v_qty,
    'point_moved', v_point_moved,
    'point_moved_to', v_sib_id
  );
end;
$function$;
