-- 2026-11-26 사장님: 「구독무배 인증된 사람들은 1회성일지, 구독무배 ON 일 때 계속 혜택 줄지 선택. 기본은 계속」
-- 설정 subscribe_free_ship_v1 의 "mode": "once" 일 때만 한 계정 1번. 값이 없거나 그 밖이면 «계속»(기본).
-- 바뀌는 것 두 곳(판정만, 배송비 계산식·포인트 계산 무변경):
--   ① ruru_subscribe_free_ship_eligible: «이미 씀(redemptions)» 검사를 once 일 때만.
--   ② 주문 제출 RPC(submit_customer_order_with_bank_routing)의 «1회만 사용 가능» 예외를 once 일 때만.
--      (계속 방식에서 두 번째 주문은 redemptions 표에 줄이 이미 있어 INSERT 가 건너뛰어지고, 예외 없이 진행 →
--       orders.subscribe_free_ship_at·0.5% 적립률 스냅샷은 예전처럼 그 주문에 기록)
-- 되돌리기: subscribe_eligible_anytime_20261124.sql 다시 실행 + 아래 ② 의 replace 를 거꾸로.
CREATE OR REPLACE FUNCTION public.ruru_subscribe_free_ship_eligible(
  p_kakao_id text, p_at timestamptz DEFAULT now()
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'public','pg_temp'
AS $ruru_eligible$
DECLARE
  v_cfg jsonb;
BEGIN
  IF nullif(trim(coalesce(p_kakao_id,'')),'') IS NULL THEN RETURN false; END IF;
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
  IF coalesce(v_cfg->>'mode','always')='once'
     AND EXISTS(SELECT 1 FROM public.subscribe_free_ship_redemptions WHERE kakao_id=p_kakao_id) THEN
    RETURN false;
  END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.subscribe_verifications v
    WHERE v.kakao_id=p_kakao_id AND v.status='verified'
  );
END;
$ruru_eligible$;
REVOKE ALL ON FUNCTION public.ruru_subscribe_free_ship_eligible(text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ruru_subscribe_free_ship_eligible(text,timestamptz) TO service_role;

DO $ruru_mode_patch$
DECLARE
  v_def text;
  v_old text := E'      IF NOT FOUND THEN\n        RAISE EXCEPTION ''구독 무료배송 혜택은 1회만';
  v_new text := E'      IF NOT FOUND AND coalesce((SELECT value::jsonb->>''mode'' FROM public.settings WHERE key=''subscribe_free_ship_v1''),''always'')=''once'' THEN\n        RAISE EXCEPTION ''구독 무료배송 혜택은 1회만';
BEGIN
  SELECT pg_get_functiondef('public.submit_customer_order_with_bank_routing(jsonb,integer,text,text,text,text,text)'::regprocedure)
    INTO v_def;
  IF position('subscribe_free_ship_v1''),''always'')=''once''' IN v_def)>0 THEN
    RAISE NOTICE 'RURU mode patch already applied';
  ELSIF (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Unexpected RPC text; refusing to patch (found % times)', (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  ELSE
    EXECUTE replace(v_def,v_old,v_new);
  END IF;
END;
$ruru_mode_patch$;

-- 확인: 두 줄 모두 true
SELECT position('''mode''' in pg_get_functiondef('public.ruru_subscribe_free_ship_eligible(text,timestamptz)'::regprocedure))>0 AS eligible_has_mode,
       position('''always'')=''once''' in pg_get_functiondef('public.submit_customer_order_with_bank_routing(jsonb,integer,text,text,text,text,text)'::regprocedure))>0 AS rpc_has_mode;
