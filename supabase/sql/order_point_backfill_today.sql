-- supabase/sql/order_point_backfill_today.sql
-- 목적: 오늘(KST) 방송에서 이미 "결제완료"(자동/수동 입금확인·카드결제완료)된 주문 중
--       아직 적립되지 않은 건을 소급해서 포인트 적립.
-- 주의:
-- - 이 파일을 만드는 것만으로는 적용 안 됨. Supabase SQL Editor에서 직접 실행.
-- - 돈/입금/매칭 로직은 안 건드림. 이미 확정된 주문상태를 "읽기만" 하고 포인트만 추가.
-- - 적립률 고정 1.5% (= 15/1000, bigint 정수연산). 예: 1만원 → 150P.
-- - 1주문(order_group_id) 1회. point_earned_at으로 중복 적립 방지.
-- - 제외: 포인트 사용 주문(point_used_amount>0) / 테스트(is_test_order) / 정산제외(exclude_from_settlement).
-- - 다른 비율로 바꾸려면 1단계 select와 2단계 v_accrual의 "* 15 / 1000"만 수정.


-- ===== 0단계: 컬럼 보장 (트리거 SQL을 아직 안 돌렸다면 먼저 이것부터) =====
alter table public.orders add column if not exists point_earned_at timestamptz;
alter table public.orders add column if not exists point_earned_amount integer not null default 0;


-- ===== 1단계: 미리보기 (DB 변경 없음 — 대상/금액 먼저 확인) =====
-- 적립률 고정 1.5% (= 15/1000). bigint 정수연산이라 소수점 부동소수 오차 없음.
select
  o.youtube_nickname,
  o.customer_name,
  regexp_replace(coalesce(o.customer_phone, o.phone, ''), '[^0-9]', '', 'g') as customer_phone,
  o.order_group_id,
  sum(coalesce(nullif(o.adjusted_product_price, 0), o.product_price, 0) * greatest(coalesce(o.qty, 1), 1)) as 상품금액합계,
  (sum(coalesce(nullif(o.adjusted_product_price, 0), o.product_price, 0) * greatest(coalesce(o.qty, 1), 1))::bigint * 15 / 1000)::integer as 적립예정포인트,
  max(coalesce(nullif(trim(o.admin_order_status_v2), ''), o.order_manage_status)) as 상태,
  1.5 as 적용적립률
from public.orders o
where
  (o.admin_order_status_v2 like '%입금확인%' or o.admin_order_status_v2 = '카드결제완료'
   or o.order_manage_status like '%입금확인%' or o.order_manage_status = '카드결제완료')
  and (o.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
  and o.point_earned_at is null
  and coalesce(o.point_used_amount, 0) = 0
  and coalesce(o.exclude_from_settlement, false) = false
  and coalesce(o.is_test_order, false) = false
group by
  o.youtube_nickname, o.customer_name,
  regexp_replace(coalesce(o.customer_phone, o.phone, ''), '[^0-9]', '', 'g'),
  o.order_group_id
order by customer_phone;


-- ===== 2단계: 실제 적립 =====
-- ★★★ 위 1단계 미리보기로 대상/금액을 반드시 먼저 확인한 뒤 실행하세요. ★★★
-- (한 번 실행하면 point_earned_at이 찍혀 다시 실행해도 중복 적립되지 않습니다.)
DO $$
DECLARE
  v_now timestamptz := now();
  r record;
  v_current integer;
  v_balance_after integer;
  v_accrual integer;
  v_done integer := 0;
  v_total integer := 0;
BEGIN
  -- 적립률 고정 1.5% (= 15/1000). 다른 비율로 하려면 아래 v_accrual 계산식의 15/1000만 바꾸세요.
  FOR r IN
    SELECT
      o.order_group_id AS grp,
      regexp_replace(coalesce(max(o.customer_phone), max(o.phone), ''), '[^0-9]', '', 'g') AS phone,
      max(o.youtube_nickname) AS nick,
      max(o.customer_name) AS cname,
      min(o.id) AS first_id,
      coalesce(sum(coalesce(nullif(o.adjusted_product_price, 0), o.product_price, 0) * greatest(coalesce(o.qty, 1), 1)), 0)::integer AS amount
    FROM public.orders o
    WHERE
      (o.admin_order_status_v2 LIKE '%입금확인%' OR o.admin_order_status_v2 = '카드결제완료'
       OR o.order_manage_status LIKE '%입금확인%' OR o.order_manage_status = '카드결제완료')
      AND (o.created_at AT TIME ZONE 'Asia/Seoul')::date = (v_now AT TIME ZONE 'Asia/Seoul')::date
      AND o.point_earned_at IS NULL
      AND coalesce(o.point_used_amount, 0) = 0
      AND coalesce(o.exclude_from_settlement, false) = false
      AND coalesce(o.is_test_order, false) = false
      AND o.order_group_id IS NOT NULL
    GROUP BY o.order_group_id
  LOOP
    v_total := v_total + 1;
    v_accrual := (r.amount::bigint * 15 / 1000)::integer;  -- 고정 1.5%

    -- 적립액 0 또는 전화번호 이상 → 적립 없이 중복방지 표시만
    IF v_accrual <= 0 OR length(r.phone) < 10 THEN
      UPDATE public.orders SET point_earned_at = v_now, point_earned_amount = 0
        WHERE order_group_id = r.grp AND point_earned_at IS NULL;
      CONTINUE;
    END IF;

    -- 현재 잔액(행 잠금) → 누적 적립
    SELECT coalesce(current_points, 0) INTO v_current
      FROM public.customer_point_balances WHERE customer_phone = r.phone FOR UPDATE;
    v_current := coalesce(v_current, 0);
    v_balance_after := v_current + v_accrual;

    -- 적립 이력 (양수 grant) — customer_seen_at=now 로 선물 팝업 미표시(내역엔 노출)
    INSERT INTO public.customer_point_ledger (
      customer_phone, youtube_nickname, customer_name,
      change_type, amount, balance_after, reason, admin_memo,
      related_order_id, customer_visible, customer_seen_at, created_by
    ) VALUES (
      r.phone, nullif(r.nick, ''), nullif(r.cname, ''),
      'grant', v_accrual, v_balance_after, '주문 결제완료 자동적립(소급)',
      '오늘 결제완료 주문 소급 적립(1.5%)',
      r.first_id::text, true, v_now, 'auto-earn-backfill'
    );

    -- 잔액 갱신
    INSERT INTO public.customer_point_balances (
      customer_phone, youtube_nickname, customer_name,
      current_points, total_granted_points, total_used_points, last_granted_at, updated_at
    ) VALUES (
      r.phone, nullif(r.nick, ''), nullif(r.cname, ''),
      v_balance_after, v_accrual, 0, v_now, v_now
    )
    ON CONFLICT (customer_phone) DO UPDATE SET
      youtube_nickname = coalesce(excluded.youtube_nickname, public.customer_point_balances.youtube_nickname),
      customer_name = coalesce(excluded.customer_name, public.customer_point_balances.customer_name),
      current_points = public.customer_point_balances.current_points + v_accrual,
      total_granted_points = coalesce(public.customer_point_balances.total_granted_points, 0) + v_accrual,
      last_granted_at = v_now,
      updated_at = v_now;

    -- 중복 적립 방지 표시(그룹 전체)
    UPDATE public.orders SET point_earned_at = v_now, point_earned_amount = v_accrual
      WHERE order_group_id = r.grp AND point_earned_at IS NULL;

    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE '소급 적립 완료: 대상 주문그룹 % 건 중 % 건 적립(적립률 1.5%%)', v_total, v_done;
END $$;
