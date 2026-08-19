-- supabase/sql/admin_change_order_payment_method_rpc.sql
-- [2026-08-20 사장님 요청] 주문서 결제수단 전환 (무통장입금 ↔ 카드결제) — 버튼 1개로.
--
-- 금액 계산식은 주문 제출 시(app/order/page.tsx 4196~4237행)와 100% 동일하게 맞춘다:
--   카드수수료   = 카드결제일 때 round((상품금액 + 그 행 배송비) × 고객수수료율 / 100), 무통장이면 0
--   total_price  = adjusted_total_price = 상품금액 + 배송비 + 카드수수료
--   vat_amount   = 카드수수료
--   final_amount = 총액 - 사용포인트 (0 미만 클램프, 기존 값이 있을 때만 갱신)
--   customer_card_extra_rate_applied / actual_card_fee_rate_applied 도 함께 저장
--
-- 요율: [사장님 결정 A] 주문 당시 값이 아니라 지금 설정값(settings)을 적용한다.
--
-- 차단 조건 [사장님 결정 A] — 돈 사고 방지:
--   · 이미 입금확인 / 카드결제완료된 주문 → 예외. [입금확인 취소] 먼저 하도록 안내
--   · 취소·환불된 주문                    → 예외
--
-- 절대 건드리지 않음: 상품·수량·단가·배송비·재고·point_used_amount·deposits(입금내역)
-- 트랜잭션: 함수 전체가 한 트랜잭션 — 중간 실패 시 전부 롤백(부분 반영 없음)
-- 적용: Supabase SQL Editor에 붙여넣고 Run (커밋만으론 미적용)

create or replace function public.admin_change_order_payment_method(
  p_order_group_id text default null,
  p_order_ids bigint[] default null,
  p_target_method text default null,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target text := btrim(coalesce(p_target_method, ''));
  v_ids bigint[];
  v_group text := nullif(btrim(coalesce(p_order_group_id, '')), '');
  v_customer_rate numeric;
  v_actual_rate numeric;
  v_is_card boolean;
  v_blocked text;
  v_before integer := 0;
  v_after integer := 0;
  v_count integer := 0;
  v_has_actual_fee_col boolean;
begin
  if v_target not in ('무통장입금', '카드결제') then
    raise exception '결제수단은 무통장입금 또는 카드결제만 가능합니다. 받은 값: %', v_target;
  end if;

  -- 1) 대상 주문 행 확정 (그룹 우선, 없으면 id 배열)
  if v_group is not null then
    select array_agg(o.id) into v_ids
      from public.orders o
     where o.order_group_id = v_group and o.is_deleted is not true;
  else
    select array_agg(o.id) into v_ids
      from public.orders o
     where o.id = any(coalesce(p_order_ids, '{}'::bigint[])) and o.is_deleted is not true;
  end if;

  if v_ids is null or coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception '결제수단을 바꿀 주문을 찾지 못했습니다.';
  end if;

  -- 2) 안전 가드 — 입금확인/카드결제완료/취소 주문 차단
  select string_agg(distinct t.reason, chr(10)) into v_blocked
  from (
    select case
      when (coalesce(o.admin_order_status_v2,'') || ' ' || coalesce(o.order_manage_status,'') || ' ' || coalesce(o.order_status,''))
             ~ '(취소|환불)'
        then '취소·환불된 주문은 결제수단을 바꿀 수 없습니다.'
      when o.deposit_confirmed_at is not null
        or (coalesce(o.admin_order_status_v2,'') || ' ' || coalesce(o.order_manage_status,''))
             ~ '(입금확인|카드결제완료|결제완료|카드완료)'
        then '이미 입금확인(또는 카드결제완료)된 주문입니다. [입금확인 취소]를 먼저 하고 다시 시도하세요.'
      else null
    end as reason
    from public.orders o
    where o.id = any(v_ids)
  ) t
  where t.reason is not null;

  if v_blocked is not null then
    raise exception '%', v_blocked;
  end if;

  -- 3) 지금 설정값 요율 읽기 (사장님 결정 A)
  select nullif(btrim(s.value), '')::numeric into v_customer_rate
    from public.settings s where s.key = 'customer_card_extra_rate' limit 1;
  select nullif(btrim(s.value), '')::numeric into v_actual_rate
    from public.settings s where s.key = 'actual_card_fee_rate' limit 1;

  -- 주문서 화면과 동일한 범위 클램프(0~20). 설정이 비었으면 화면 기본값과 동일하게 10 / 7.
  v_customer_rate := least(20, greatest(0, coalesce(v_customer_rate, 10)));
  v_actual_rate   := least(20, greatest(0, coalesce(v_actual_rate, 7)));

  v_is_card := (v_target = '카드결제');

  select coalesce(sum(coalesce(o.adjusted_total_price, o.total_price, 0)), 0)::integer
    into v_before
    from public.orders o where o.id = any(v_ids);

  -- 4) 새 금액 계산 (제출 시 공식과 동일)
  select coalesce(sum(
           c.prod + c.ship
           + case when v_is_card then round((c.prod + c.ship) * v_customer_rate / 100.0)::integer else 0 end
         ), 0)::integer,
         count(*)::integer
    into v_after, v_count
  from (
    select coalesce(o.adjusted_product_price,
                    coalesce(o.product_price, 0) * greatest(coalesce(o.qty, 1), 1), 0)::integer as prod,
           coalesce(o.adjusted_shipping_fee, o.shipping_fee, 0)::integer as ship
      from public.orders o where o.id = any(v_ids)
  ) c;

  if p_dry_run then
    return jsonb_build_object(
      'ok', true,
      'mode', 'dry_run',
      'target_method', v_target,
      'order_count', v_count,
      'customer_card_rate', v_customer_rate,
      'before_total', v_before,
      'after_total', v_after,
      'diff', v_after - v_before
    );
  end if;

  -- 5) 실제 반영
  with calc as (
    select o.id,
           coalesce(o.adjusted_product_price,
                    coalesce(o.product_price, 0) * greatest(coalesce(o.qty, 1), 1), 0)::integer as prod,
           coalesce(o.adjusted_shipping_fee, o.shipping_fee, 0)::integer as ship
      from public.orders o where o.id = any(v_ids)
  ), calc2 as (
    select c.id, c.prod, c.ship,
           case when v_is_card then round((c.prod + c.ship) * v_customer_rate / 100.0)::integer else 0 end as card_extra
      from calc c
  )
  update public.orders o
     set payment_method = v_target,
         vat_amount = c.card_extra,
         total_price = c.prod + c.ship + c.card_extra,
         adjusted_total_price = c.prod + c.ship + c.card_extra,
         -- final_amount 는 "총액 - 사용포인트" (주문 제출 RPC / 상품수정 RPC와 동일 기준).
         --   원래 null 이던 주문은 null 유지 — 없던 값을 새로 만들지 않는다.
         final_amount = case
           when o.final_amount is not null
             then greatest(0, c.prod + c.ship + c.card_extra - coalesce(o.point_used_amount, 0))
           else o.final_amount
         end,
         customer_card_extra_rate_applied = case when v_is_card then v_customer_rate else 0 end,
         actual_card_fee_rate_applied = case when v_is_card then v_actual_rate else 0 end
    from calc2 c
   where o.id = c.id;

  -- 선택 컬럼(actual_card_fee_amount)이 있는 프로젝트에서만 함께 갱신.
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orders' and column_name = 'actual_card_fee_amount'
  ) into v_has_actual_fee_col;

  if v_has_actual_fee_col then
    execute format(
      'update public.orders o set actual_card_fee_amount = case when %L then round(coalesce(o.adjusted_product_price, coalesce(o.product_price,0) * greatest(coalesce(o.qty,1),1), 0) * %s / 100.0)::integer else 0 end where o.id = any(%L::bigint[])',
      v_is_card, v_actual_rate, v_ids
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'mode', 'changed',
    'target_method', v_target,
    'order_count', v_count,
    'customer_card_rate', v_customer_rate,
    'before_total', v_before,
    'after_total', v_after,
    'diff', v_after - v_before
  );
end
$function$;

-- 검증(읽기 전용): 함수가 생성됐는지
select proname, pronargs
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'admin_change_order_payment_method';
