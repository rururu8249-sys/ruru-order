-- RURU 2026-11-22: one-time subscription shipping reward + order-time point rate.
-- Additive schema changes; legacy redemption backfill also tags the matching first
-- old order group in a new metadata column. Never changes money/status/points.
ALTER TABLE public.subscribe_verifications
  ADD COLUMN IF NOT EXISTS benefit_window_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS benefit_window_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS benefit_broadcast_id uuid;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS point_earn_rate_snapshot numeric(6,3),
  ADD COLUMN IF NOT EXISTS subscribe_promo_redemption boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.subscribe_free_ship_redemptions (
  kakao_id text PRIMARY KEY,
  order_group_id text NOT NULL UNIQUE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscribe_free_ship_redemptions_kakao_nonempty CHECK(length(trim(kakao_id))>0),
  CONSTRAINT subscribe_free_ship_redemptions_group_nonempty CHECK(length(trim(order_group_id))>0)
);
ALTER TABLE public.subscribe_free_ship_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscribe_free_ship_redemptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.subscribe_free_ship_redemptions TO service_role;

INSERT INTO public.settings(key,value)
VALUES('subscribe_free_ship_point_earn_rate','0.5')
ON CONFLICT(key) DO NOTHING;

-- One existing group per account maximum. The old marker was only a UI marker:
-- historical redeemers are conservatively blocked from a second promotion;
-- this does NOT assert that every old marker was a monetary discount.
WITH eligible AS (
  SELECT o.kakao_id, o.order_group_id,
         min(coalesce(o.subscribe_free_ship_at,o.created_at)) AS used_at
  FROM public.orders o
  WHERE o.subscribe_free_ship_at IS NOT NULL
    AND trim(coalesce(o.kakao_id,'')) <> ''
    AND trim(coalesce(o.order_group_id,'')) <> ''
    AND o.is_deleted IS DISTINCT FROM true
    AND o.is_test_order IS DISTINCT FROM true
    AND lower(concat_ws(' ',o.order_manage_status,o.order_status,o.admin_order_status_v2)) !~ '취소|환불|cancel|refund'
  GROUP BY o.kakao_id,o.order_group_id
  HAVING sum(greatest(coalesce(o.shipping_fee,0),coalesce(o.adjusted_shipping_fee,0)))=0
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY kakao_id ORDER BY used_at,order_group_id) AS n
  FROM eligible
)
INSERT INTO public.subscribe_free_ship_redemptions(kakao_id,order_group_id,redeemed_at)
SELECT kakao_id,order_group_id,used_at FROM ranked WHERE n=1
ON CONFLICT DO NOTHING;

-- Mark only the single FIRST historical promo-looking group, not every order
-- that the old UI marker indiscriminately labeled during an active campaign.
UPDATE public.orders o SET subscribe_promo_redemption=true
FROM public.subscribe_free_ship_redemptions r
WHERE o.order_group_id=r.order_group_id AND o.kakao_id=r.kakao_id
  AND o.subscribe_promo_redemption IS DISTINCT FROM true;

-- New customer verification: approvedAt and effective combine-window are captured in the application.
-- Existing customer verification rows are not overwritten or re-dated.

-- Server-verified authorization gate. This helper never grants a second redemption.
CREATE OR REPLACE FUNCTION public.ruru_subscribe_free_ship_eligible(
  p_kakao_id text, p_at timestamptz DEFAULT now()
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'public','pg_temp'
AS $ruru_eligible$
DECLARE
  v_cfg jsonb;
  v_manual text;
  v_manual_start timestamptz;
  v_manual_end timestamptz;
  v_manual_active boolean := false;
BEGIN
  IF nullif(trim(coalesce(p_kakao_id,'')),'') IS NULL THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.subscribe_free_ship_redemptions WHERE kakao_id=p_kakao_id) THEN
    RETURN false;
  END IF;

  BEGIN
    SELECT value::jsonb INTO v_cfg FROM public.settings WHERE key='subscribe_free_ship_v1';
    IF coalesce((v_cfg->>'enabled')::boolean,false) IS NOT true THEN RETURN false; END IF;
    IF jsonb_typeof(v_cfg->'groups') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_cfg->'groups')=0 THEN RETURN false; END IF;
    IF v_cfg->>'startAt' IS NULL OR v_cfg->>'endAt' IS NULL
       OR (v_cfg->>'startAt')::timestamptz >= (v_cfg->>'endAt')::timestamptz
       OR p_at < (v_cfg->>'startAt')::timestamptz OR p_at > (v_cfg->>'endAt')::timestamptz THEN
      RETURN false;
    END IF;
  EXCEPTION WHEN OTHERS THEN RETURN false;
  END;

  BEGIN
    SELECT value INTO v_manual FROM public.settings WHERE key='combine_shipping_enabled';
    IF v_manual='true' THEN
      SELECT value::timestamptz INTO v_manual_start FROM public.settings WHERE key='combine_shipping_start_at';
      SELECT value::timestamptz INTO v_manual_end FROM public.settings WHERE key='combine_shipping_end_at';
      v_manual_active := v_manual_start <= p_at AND p_at <= v_manual_end;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_manual_active := false;
  END;

  RETURN EXISTS(
    SELECT 1 FROM public.subscribe_verifications v
    WHERE v.kakao_id=p_kakao_id AND v.status='verified'
      AND (
        (v.benefit_broadcast_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.broadcasts b WHERE b.id=v.benefit_broadcast_id
            AND upper(coalesce(b.status,''))='ON' AND p_at>=coalesce(b.started_at,b.created_at)
        ))
        OR
        (v.benefit_window_start_at IS NOT NULL
         AND v.benefit_window_end_at IS NOT NULL
         AND p_at>=v.benefit_window_start_at AND p_at<=v.benefit_window_end_at)
        OR
        (v.benefit_broadcast_id IS NULL AND v.benefit_window_start_at IS NULL AND v.benefit_window_end_at IS NULL
         AND (
           (v_manual_active AND v.created_at>=v_manual_start AND v.created_at<=v_manual_end)
           OR (NOT v_manual_active AND (v.created_at AT TIME ZONE 'Asia/Seoul')::date = (p_at AT TIME ZONE 'Asia/Seoul')::date)
         ))
      )
  );
END;
$ruru_eligible$;
REVOKE ALL ON FUNCTION public.ruru_subscribe_free_ship_eligible(text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ruru_subscribe_free_ship_eligible(text,timestamptz) TO service_role;

-- Patch existing bank-routing RPC without replacing/losing the account-routing logic.
DO $ruru_migrate_wrapper$
DECLARE
  v_def text;
  v_decl_anchor text := '  v_is_duplicate boolean := false;';
  v_return_anchor text := '  return v_result;';
BEGIN
  SELECT pg_get_functiondef('public.submit_customer_order_with_bank_routing(jsonb,integer,text,text,text,text,text)'::regprocedure)
    INTO v_def;
  IF position('ruru_subscribe_waiver_requested' IN v_def)>0 THEN
    RAISE NOTICE 'RURU bank-routing already patched';
  ELSE
    IF position(v_decl_anchor IN v_def)=0 OR position(v_return_anchor IN v_def)=0 THEN
      RAISE EXCEPTION 'Unexpected bank-routing RPC version; refusing to patch';
    END IF;
    v_def := replace(v_def,v_decl_anchor,
      v_decl_anchor || E'\n  v_claim boolean := coalesce((p_order_rows->0->>''ruru_subscribe_waiver_requested'')::boolean,false);' ||
      E'\n  v_earn_rate numeric;\n  v_promo_rate numeric;');
    v_def := replace(v_def,v_return_anchor,$ruru_wrapped$
  -- The bank-routing base RPC has already written the group in this transaction.
  -- Snapshot point rates before payment may later be confirmed, independently of settings changes.
  IF NOT v_is_duplicate AND v_group_id IS NOT NULL THEN
    SELECT coalesce(nullif(trim(value),'')::numeric,0) INTO v_earn_rate
      FROM public.settings WHERE key='point_earn_rate';
    SELECT coalesce(nullif(trim(value),'')::numeric,0.5) INTO v_promo_rate
      FROM public.settings WHERE key='subscribe_free_ship_point_earn_rate';
    v_earn_rate := greatest(0,least(100,coalesce(v_earn_rate,0)));
    v_promo_rate := greatest(0,least(100,coalesce(v_promo_rate,0.5)));

    IF v_claim THEN
      IF nullif(trim(coalesce(p_kakao_id,'')),'') IS NULL OR
         NOT public.ruru_subscribe_free_ship_eligible(p_kakao_id,v_now) THEN
        RAISE EXCEPTION '구독 무료배송 혜택이 이미 사용되었거나 기간이 종료되었습니다. 새로고침 후 다시 주문해 주세요.';
      END IF;
      INSERT INTO public.subscribe_free_ship_redemptions(kakao_id,order_group_id,redeemed_at)
      VALUES(p_kakao_id,v_group_id,v_now) ON CONFLICT DO NOTHING;
      IF NOT FOUND THEN
        RAISE EXCEPTION '구독 무료배송 혜택은 1회만 사용 가능합니다. 새로고침 후 다시 주문해 주세요.';
      END IF;
      UPDATE public.orders SET subscribe_free_ship_at=v_now,
             subscribe_promo_redemption=true,
             point_earn_rate_snapshot=v_promo_rate
       WHERE order_group_id=v_group_id;
    ELSE
      UPDATE public.orders SET point_earn_rate_snapshot=v_earn_rate
       WHERE order_group_id=v_group_id AND point_earn_rate_snapshot IS NULL;
    END IF;
  END IF;

  return v_result;
$ruru_wrapped$);
    EXECUTE v_def;
  END IF;
END;
$ruru_migrate_wrapper$;

-- Existing automatic point-accrual trigger reads the global setting at payment time.
-- Change only that decision: prefer the point-rate snapshot saved with this order.
DO $ruru_migrate_points$
DECLARE
  v_def text;
  v_anchor text := '  if coalesce(v_enabled, false) = false or coalesce(v_rate, 0) <= 0 then';
BEGIN
  SELECT pg_get_functiondef('public.accrue_order_points_on_confirm()'::regprocedure) INTO v_def;
  IF position('NEW.point_earn_rate_snapshot' IN v_def)>0 THEN
    RAISE NOTICE 'RURU points trigger already patched';
  ELSE
    IF position(v_anchor IN v_def)=0 THEN
      RAISE EXCEPTION 'Unexpected point-accrual trigger version; refusing to patch';
    END IF;
    v_def := replace(v_def,v_anchor,
      '  v_rate := coalesce(NEW.point_earn_rate_snapshot,v_rate);' || E'\n' || v_anchor);
    EXECUTE v_def;
  END IF;
END;
$ruru_migrate_points$;

