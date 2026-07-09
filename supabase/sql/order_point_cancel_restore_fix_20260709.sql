-- ============================================================
-- [버그수정] 주문취소 시 포인트 잔액 row 가 없으면 취소 자체가 실패하던 문제
-- 위치: supabase/sql/order_point_cancel_restore_fix_20260709.sql
-- 작성: 2026-07-09
--
-- [무엇이 문제였나]
--   cancel_order_and_restore_points() 가 주문에 적힌 전화번호로 포인트 잔액을 찾고,
--   못 찾으면 `raise exception` 을 던져 **주문취소 트랜잭션 전체가 실패**했다.
--   특히 고객이 전화번호를 바꾸면(잔액은 새 번호로 이동) 옛 번호로 된 주문을 취소할 때
--   잔액을 못 찾아 취소가 막힌다.
--
-- [어떻게 고치나 — 3단 폴백]
--   ① 주문에 적힌 번호로 잔액을 찾는다(기존과 동일).
--   ② 없으면 주문에 찍힌 kakao_id 로 그 고객의 **현재 번호**를 찾아 다시 찾는다.
--   ③ 그래도 없으면 잔액 row 를 새로 만든다(0에서 시작). **예외를 던지지 않는다.**
--   → 어떤 경우에도 주문취소가 실패하지 않는다.
--
-- [바뀌지 않는 것]
--   * 복구 금액 계산(v_restore_amount = point_used_amount) 그대로
--   * 중복복구 차단(point_refunded_at / point_refund_ledger_id) 그대로
--   * 주문 금액·final_amount·입금내역·Bankda·정산 계산식 무변경
--   * 이력(ledger) 기록 형식 그대로
--
-- ⚠️ 이 파일은 함수만 교체한다(컬럼/제약 추가 없음). 재실행 안전.
-- ============================================================

begin;

create or replace function public.cancel_order_and_restore_points(
  p_order_ids integer[],
  p_cancel_status text default '주문취소',
  p_admin_memo text default '주문서취소 자동 포인트 복구'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_order record;
  v_current_points integer;
  v_next_points integer;
  v_restore_amount integer;
  v_ledger_id uuid;
  v_updated_count integer := 0;
  v_restored_count integer := 0;
  v_restored_total integer := 0;
  v_skipped_no_point integer := 0;
  v_skipped_already_refunded integer := 0;
  v_clean_memo text := coalesce(nullif(trim(p_admin_memo), ''), '주문서취소 자동 포인트 복구');
  v_clean_status text := coalesce(nullif(trim(p_cancel_status), ''), '주문취소');
  -- ▼ 신규: 번호가 바뀐 고객도 잔액을 찾아내기 위한 대상 번호
  v_target_phone text;
  v_alt_phone text;
begin
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    return jsonb_build_object(
      'ok', true,
      'mode', 'empty_order_ids',
      'updated_count', 0,
      'restored_count', 0,
      'restored_total', 0,
      'skipped_no_point', 0,
      'skipped_already_refunded', 0
    );
  end if;

  for v_order in
    select
      id,
      customer_phone,
      kakao_id,                    -- ▼ 신규: 정체성 스탬프(번호 바뀌어도 안 변함)
      youtube_nickname,
      customer_name,
      point_used_amount,
      point_refunded_amount,
      point_refund_ledger_id,
      point_refunded_at
    from public.orders
    where id = any(p_order_ids)
    for update
  loop
    update public.orders
      set
        admin_order_status_v2 = v_clean_status,
        order_manage_status = v_clean_status
      where id = v_order.id;

    v_updated_count := v_updated_count + 1;
    v_restore_amount := greatest(0, coalesce(v_order.point_used_amount, 0));

    if v_restore_amount <= 0 then
      v_skipped_no_point := v_skipped_no_point + 1;
      continue;
    end if;

    if coalesce(v_order.point_refunded_amount, 0) > 0
      or v_order.point_refund_ledger_id is not null
      or v_order.point_refunded_at is not null
    then
      v_skipped_already_refunded := v_skipped_already_refunded + 1;
      continue;
    end if;

    -- 반복문마다 초기화 (이전 주문의 값이 남지 않게)
    v_current_points := null;
    v_alt_phone := null;
    v_target_phone := regexp_replace(coalesce(v_order.customer_phone, ''), '[^0-9]', '', 'g');

    if v_target_phone = '' then
      raise exception '포인트 복구 실패: 주문 % 고객 전화번호가 없습니다.', v_order.id;
    end if;

    ---------------------------------------------------------------
    -- ① 주문에 적힌 번호로 잔액 찾기
    ---------------------------------------------------------------
    select coalesce(current_points, 0)
      into v_current_points
    from public.customer_point_balances
    where customer_phone = v_target_phone
    for update;

    ---------------------------------------------------------------
    -- ② 못 찾으면: 주문의 kakao_id 로 그 고객의 "현재 번호"를 찾아 재시도
    --    (전화번호를 바꾼 고객 — 잔액은 트리거로 새 번호에 가 있다)
    ---------------------------------------------------------------
    if v_current_points is null
       and coalesce(nullif(trim(coalesce(v_order.kakao_id, '')), ''), '') <> ''
    then
      select regexp_replace(coalesce(c.customer_phone, ''), '[^0-9]', '', 'g')
        into v_alt_phone
      from public.customers c
      where c.kakao_id = v_order.kakao_id
      limit 1;

      if v_alt_phone is not null and v_alt_phone <> '' and v_alt_phone <> v_target_phone then
        select coalesce(current_points, 0)
          into v_current_points
        from public.customer_point_balances
        where customer_phone = v_alt_phone
        for update;

        if v_current_points is not null then
          v_target_phone := v_alt_phone;   -- 현재 번호로 복구한다
        end if;
      end if;
    end if;

    ---------------------------------------------------------------
    -- ③ 그래도 없으면: 잔액 row 를 새로 만든다. 절대 예외를 던지지 않는다.
    --    (예전에는 여기서 raise exception → 주문취소 전체가 실패했음)
    ---------------------------------------------------------------
    if v_current_points is null then
      insert into public.customer_point_balances (
        customer_phone,
        youtube_nickname,
        customer_name,
        current_points,
        total_granted_points,
        total_used_points,
        total_canceled_points,
        total_adjusted_points,
        created_at,
        updated_at
      ) values (
        v_target_phone,
        nullif(v_order.youtube_nickname, ''),
        nullif(v_order.customer_name, ''),
        0, 0, 0, 0, 0,
        v_now,
        v_now
      )
      on conflict (customer_phone) do nothing;

      select coalesce(current_points, 0)
        into v_current_points
      from public.customer_point_balances
      where customer_phone = v_target_phone
      for update;

      if v_current_points is null then
        v_current_points := 0;
      end if;
    end if;

    v_next_points := greatest(0, coalesce(v_current_points, 0)) + v_restore_amount;
    v_ledger_id := gen_random_uuid();

    insert into public.customer_point_ledger (
      id,
      customer_phone,
      youtube_nickname,
      customer_name,
      change_type,
      amount,
      balance_after,
      reason,
      admin_memo,
      related_order_id,
      customer_visible,
      created_by,
      created_at
    ) values (
      v_ledger_id,
      v_target_phone,               -- ▼ 주문의 옛 번호가 아니라 "실제 잔액이 있는 번호"
      v_order.youtube_nickname,
      v_order.customer_name,
      'cancel',
      v_restore_amount,
      v_next_points,
      '주문취소 포인트 자동복구',
      v_clean_memo,
      v_order.id::text,
      true,
      'admin-live-order-cancel',
      v_now
    );

    update public.customer_point_balances
      set
        youtube_nickname = coalesce(nullif(v_order.youtube_nickname, ''), youtube_nickname),
        customer_name = coalesce(nullif(v_order.customer_name, ''), customer_name),
        current_points = v_next_points,
        total_canceled_points = coalesce(total_canceled_points, 0) + v_restore_amount,
        updated_at = v_now
      where customer_phone = v_target_phone;

    update public.orders
      set
        point_refunded_amount = v_restore_amount,
        point_refund_ledger_id = v_ledger_id,
        point_refunded_at = v_now,
        point_refund_memo = v_clean_memo
      where id = v_order.id;

    v_restored_count := v_restored_count + 1;
    v_restored_total := v_restored_total + v_restore_amount;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'mode', 'cancel_order_and_restore_points',
    'updated_count', v_updated_count,
    'restored_count', v_restored_count,
    'restored_total', v_restored_total,
    'skipped_no_point', v_skipped_no_point,
    'skipped_already_refunded', v_skipped_already_refunded
  );
end;
$$;

comment on function public.cancel_order_and_restore_points(integer[], text, text) is
  '주문서 자체 취소 시 주문상태 변경과 포인트 자동복구를 하나의 DB 트랜잭션으로 처리한다. 잔액 row가 없어도 실패하지 않고 생성/이관해 복구한다(2026-07-09). 부분환불/주문복구 재차감은 포함하지 않는다.';

commit;
