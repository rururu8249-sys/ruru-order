-- 2026-11-24 사장님: 「구독 인증을 오늘 했는데 오늘 안 샀다고 안 되게 하지 말고, 구독 인증 ON 상태에서는 그냥 두자」
-- 바뀌는 것: 인증한 방송(그날) 안에만 쓰던 조건 삭제.
-- 남는 것: ① 한 계정 1회(subscribe_free_ship_redemptions) ② 관리자 설정 켜짐 + 시작~끝 시각 안 ③ 통과(verified) 인증 있음.
-- 돈 무접촉(판정 함수만). 주문 제출 RPC·포인트 트리거는 그대로 이 함수를 부른다.
-- 되돌리기: supabase/migrations/20261122_subscribe_once_point_rate.sql 의 같은 함수 블록을 다시 실행.
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
  RETURN EXISTS(
    SELECT 1 FROM public.subscribe_verifications v
    WHERE v.kakao_id=p_kakao_id AND v.status='verified'
  );
END;
$ruru_eligible$;
REVOKE ALL ON FUNCTION public.ruru_subscribe_free_ship_eligible(text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ruru_subscribe_free_ship_eligible(text,timestamptz) TO service_role;

-- 확인: 본문에 benefit_window 가 없어야 함 → false 한 줄
SELECT position('benefit_window' in pg_get_functiondef('public.ruru_subscribe_free_ship_eligible(text,timestamptz)'::regprocedure)) > 0 AS still_has_window_rule;
