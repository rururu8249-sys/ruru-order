-- Ruru Live Commerce: one authoritative broadcast lifecycle.
-- Run on the linked Supabase project. Existing orders and payment data are untouched.
-- Service role only: public/anon/authenticated cannot call these functions.

CREATE UNIQUE INDEX IF NOT EXISTS ruru_unstarted_broadcast_title_unique
ON public.broadcasts ((lower(btrim(public_title))))
WHERE started_at IS NULL AND COALESCE(is_deleted, false) = false;

CREATE OR REPLACE FUNCTION public.ruru_admin_create_broadcast_draft(p_title text)
RETURNS public.broadcasts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_title text := btrim(p_title);
  v_row public.broadcasts%ROWTYPE;
BEGIN
  IF v_title IS NULL OR char_length(v_title) = 0 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION '방송 제목은 1~120자로 입력해주세요.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ruru-broadcast-lifecycle-v1'));
  SELECT * INTO v_row FROM public.broadcasts
   WHERE started_at IS NULL AND status = 'OFF'
     AND COALESCE(is_deleted, false) = false
     AND lower(btrim(public_title)) = lower(v_title)
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;
  INSERT INTO public.broadcasts (
    public_title,admin_subtitle,status,started_at,ended_at,shipping_fee,
    youtube_live_url,youtube_live_enabled,order_form_enabled,is_deleted
  ) VALUES (v_title,'','OFF',NULL,NULL,4000,'',false,true,false)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.ruru_admin_activate_broadcast(p_broadcast_id uuid)
RETURNS public.broadcasts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row public.broadcasts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_broadcast_id IS NULL THEN
    RAISE EXCEPTION '방송 ID가 필요합니다.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ruru-broadcast-lifecycle-v1'));
  SELECT * INTO v_row FROM public.broadcasts WHERE id=p_broadcast_id FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_row.is_deleted,false) THEN
    RAISE EXCEPTION '존재하지 않거나 숨겨진 방송입니다.' USING ERRCODE='P0001';
  END IF;
  IF v_row.status = 'ON' THEN
    RETURN v_row; -- same-ID retries must not reset start time
  END IF;
  IF v_row.status IS DISTINCT FROM 'OFF' OR v_row.started_at IS NOT NULL THEN
    RAISE EXCEPTION '방송 시작은 준비된 미시작 방송에서만 가능합니다.' USING ERRCODE='P0001';
  END IF;
  UPDATE public.broadcasts SET status='OFF',ended_at=v_now,
    widget_pin_mode='auto',widget_pin_product_id=NULL,widget_pin_detail_name=NULL
   WHERE status='ON' AND COALESCE(is_deleted,false)=false AND id<>p_broadcast_id;
  UPDATE public.broadcasts SET status='ON',started_at=v_now,ended_at=NULL,
    paused_at=NULL,order_form_enabled=true
   WHERE id=p_broadcast_id
   RETURNING * INTO v_row;
  INSERT INTO public.settings(key,value) VALUES ('broadcast_status','ON')
   ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();
  INSERT INTO public.settings(key,value) VALUES ('current_broadcast_name',v_row.public_title)
   ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.ruru_admin_end_broadcast(p_broadcast_id uuid)
RETURNS public.broadcasts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row public.broadcasts%ROWTYPE;
BEGIN
  IF p_broadcast_id IS NULL THEN
    RAISE EXCEPTION '방송 ID가 필요합니다.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ruru-broadcast-lifecycle-v1'));
  SELECT * INTO v_row FROM public.broadcasts WHERE id=p_broadcast_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '방송을 찾을 수 없습니다.' USING ERRCODE='P0001'; END IF;
  IF v_row.status <> 'ON' THEN
    RAISE EXCEPTION '이미 종료되었거나 다른 방송이 활성화되었습니다. 목록을 새로고침하세요.' USING ERRCODE='P0001';
  END IF;
  UPDATE public.broadcasts SET status='OFF',ended_at=clock_timestamp(),order_form_enabled=false,
    widget_pin_mode='auto',widget_pin_product_id=NULL,widget_pin_detail_name=NULL
   WHERE id=p_broadcast_id RETURNING * INTO v_row;
  INSERT INTO public.settings(key,value) VALUES ('broadcast_status','OFF')
   ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();
  INSERT INTO public.settings(key,value) VALUES ('current_broadcast_name','')
   ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ruru_admin_create_broadcast_draft(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ruru_admin_activate_broadcast(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ruru_admin_end_broadcast(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ruru_admin_create_broadcast_draft(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ruru_admin_activate_broadcast(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ruru_admin_end_broadcast(uuid) TO service_role;
