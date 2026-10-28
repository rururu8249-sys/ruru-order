-- 되돌리기: 포인트 옮기기 트리거만 지운다(이미 옮겨진 포인트는 그대로 — 주문서 합계가 맞는 상태라 되돌릴 필요 없음)
drop trigger if exists trg_rebalance_excess_points on public.orders;
drop function if exists public.ruru_rebalance_excess_points();
