-- 운영 orders 테이블에 존재하지 않는 payment_status 참조 때문에
-- 주문 제출 RPC가 42703(undefined_column)으로 중단되는 문제를 복구한다.
-- 실제 운영 상태 컬럼(order_manage_status, order_status, admin_status,
-- admin_order_status_v2)은 그대로 사용하므로 취소/환불 주문 제외 규칙은 유지된다.

do $hotfix$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'submit_customer_order_with_bank_routing'
    and pg_get_function_identity_arguments(p.oid) =
      'p_order_rows jsonb, p_point_use_amount integer, p_customer_phone text, p_youtube_nickname text, p_customer_name text, p_session_key text, p_kakao_id text';

  if v_definition is null then
    raise exception 'submit_customer_order_with_bank_routing 함수가 없습니다.';
  end if;

  if strpos(v_definition, 'o.payment_status') = 0 then
    return;
  end if;

  v_definition := replace(
    v_definition,
    'o.payment_status, o.order_manage_status',
    'o.order_manage_status'
  );

  if strpos(v_definition, 'o.payment_status') > 0 then
    raise exception 'payment_status 참조를 모두 제거하지 못했습니다.';
  end if;

  execute v_definition;
end
$hotfix$;
