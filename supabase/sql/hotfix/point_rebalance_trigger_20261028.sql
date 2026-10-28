-- ─────────────────────────────────────────────────────────────────────────────
-- [2026-10-28 사장님 「돈 관련 — 전수조사 후 다시는 안 생기게」] 줄 금액보다 포인트가 커지면 남는 포인트를 같은 주문서 다른 줄로
--
-- 사고(에이치_더블 c3a1b07f…, 10/28 03:53 배송비 4,000→0):
--   포인트 40,000 이 첫 줄(상품 39,000 + 배송비 4,000 = 43,000)에 다 붙어 있었는데 배송비를 0 으로 고치자
--   그 줄 final_amount = greatest(0, 39,000 − 40,000) = 0 → 남는 1,000 포인트가 어디에도 안 빠져
--   주문서 합계가 38,000 이 아니라 39,000 으로 잡힘(손님은 38,000 입금 → 입금매칭 안 됨).
--
-- 같은 «줄마다 final = greatest(0, 줄 총액 − 그 줄 포인트)» 계산을 하는 곳(전수조사 2026-10-28):
--   ① 주문상세 배송비 수정(LiveOrderDetailDrawer handleSaveShippingFee) ← 이번 사고
--   ② 주문상세 상품 수정(useLiveOrderItemEdit, 직접입력 줄)
--   ③ 재고연동 상품 수정 RPC admin_update_inventory_linked_order_item [수정3]
--   ④ 결제수단 변경 RPC admin_change_order_payment_method(카드→무통장이면 카드추가금만큼 총액 감소)
--   (주문 제출 RPC 는 넣을 때 줄마다 포인트를 줄 금액 안으로 나눠 넣고, 상품 삭제 RPC 는 이미 포인트를 남는 줄로 옮긴다 → 정상)
--   네 곳을 각각 고치는 대신, orders 에 «한 곳» 안전장치를 둔다:
--
-- 트리거 trg_rebalance_excess_points (AFTER UPDATE, 그 줄의 포인트 > 그 줄 총액일 때만 실행):
--   · 같은 주문서(order_group_id)의 살아 있는 다른 줄 중 여유(총액 − 포인트)가 큰 줄부터 남는 포인트를 옮긴다.
--   · 옮겨 받은 줄 final_amount = 총액 − 포인트(기존 공식), 원래 줄은 포인트 = 총액·final 0.
--   · 주문서 포인트 합계는 그대로(손님 포인트 잔액·포인트 이력 무접촉) → 주문서 합계 final = 총액 합 − 포인트 합.
--   · 다른 줄에도 여유가 없으면(주문서 총액 < 쓴 포인트) 남는 만큼은 원래 줄에 그대로 둔다 — 포인트를 돌려줄지 사장님 판단.
--   · 취소·환불·삭제·포인트 이미 돌려준 줄은 주지도 받지도 않는다. final_amount 가 비어 있던(null) 옛 줄은 null 그대로.
--   · 주문 넣기(INSERT)·상태 바꾸기는 건드리지 않는다(UPDATE OF 금액·포인트 칸만). 재귀 방지 pg_trigger_depth.
--   정산·입금 자동매칭·뱅크다·포인트 적립/회수 함수 본문 무변경(그들이 읽는 final_amount 합계만 맞아짐).
--
-- 되돌리기: point_rebalance_trigger_20261028_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ruru_rebalance_excess_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_excess integer;
  v_give integer;
  r record;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if coalesce(new.order_group_id, '') = '' then
    return null;
  end if;
  if coalesce(new.is_deleted, false)
     or (coalesce(new.admin_order_status_v2, '') || ' ' || coalesce(new.order_manage_status, '')) ~ '취소|환불'
     or coalesce(new.point_refunded_amount, 0) > 0
     or new.point_refunded_at is not null then
    return null;
  end if;

  v_total := greatest(0, coalesce(new.adjusted_total_price, new.total_price, 0));
  v_excess := coalesce(new.point_used_amount, 0) - v_total;
  if v_excess <= 0 then
    return null;
  end if;

  for r in
    select o.id,
           greatest(0, coalesce(o.adjusted_total_price, o.total_price, 0)) - coalesce(o.point_used_amount, 0) as headroom
      from public.orders o
     where o.order_group_id = new.order_group_id
       and o.id <> new.id
       and not coalesce(o.is_deleted, false)
       and not ((coalesce(o.admin_order_status_v2, '') || ' ' || coalesce(o.order_manage_status, '')) ~ '취소|환불')
       and coalesce(o.point_refunded_amount, 0) = 0
       and o.point_refunded_at is null
     order by 2 desc, o.id asc
     for update
  loop
    exit when v_excess <= 0;
    continue when r.headroom <= 0;
    v_give := least(v_excess, r.headroom);
    update public.orders
       set point_used_amount = coalesce(point_used_amount, 0) + v_give,
           final_amount = case
             when final_amount is null then null
             else greatest(0, coalesce(adjusted_total_price, total_price, 0) - (coalesce(point_used_amount, 0) + v_give))
           end,
           point_used_at = coalesce(point_used_at, new.point_used_at)
     where id = r.id;
    v_excess := v_excess - v_give;
  end loop;

  update public.orders
     set point_used_amount = v_total + v_excess,
         final_amount = case when final_amount is null then null else 0 end
   where id = new.id;

  return null;
end;
$$;

-- (트리거 함수는 직접 호출이 안 되므로 권한 회수 생략 — 관리자 화면의 주문 수정(anon 키)이 막히지 않게)

drop trigger if exists trg_rebalance_excess_points on public.orders;
create trigger trg_rebalance_excess_points
  after update of point_used_amount, total_price, adjusted_total_price, final_amount on public.orders
  for each row
  when (coalesce(new.point_used_amount, 0) > greatest(0, coalesce(new.adjusted_total_price, new.total_price, 0)))
  execute function public.ruru_rebalance_excess_points();

-- 설치 확인
select tgname, tgenabled from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'trg_rebalance_excess_points';
