-- ============================================================================
-- [2026-08-11] 재고 안전장치 생존 점검 RPC (읽기 전용)
-- 관리자 점검(🛡️)이 호출: ①제출 RPC에 재고거부 로직 존재 ②경비원 트리거 존재 ③담기 선점 RPC 존재
-- SELECT만 수행 — 데이터 변경 없음.
-- ============================================================================
create or replace function public.check_inventory_guard()
returns jsonb
language sql
stable
security definer
set search_path = public
as $chk$
  select jsonb_build_object(
    'submit_reject_ok',
      coalesce((select position('재고가 부족합니다' in prosrc) > 0
                from pg_proc where proname = 'submit_customer_order_with_points'
                order by pronargs desc limit 1), false),
    'guard_trigger_ok',
      exists(select 1 from pg_event_trigger where evtname = 'trg_guard_submit_rpc' and evtenabled <> 'D'),
    'claim_fn_ok',
      exists(select 1 from pg_proc where proname = 'claim_cart_hold')
  );
$chk$;

comment on function public.check_inventory_guard() is
'재고 안전장치 생존 점검(읽기 전용): 제출RPC 거부로직·경비원 트리거·담기 선점RPC 존재 확인. 2026-08-11';

select public.check_inventory_guard() as 점검결과;
