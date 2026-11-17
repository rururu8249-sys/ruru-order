-- Applied to production Supabase on 2026-11-17. Kept as reproducible source.
-- No order, deposit, picking, or payment state is modified.
CREATE TABLE IF NOT EXISTS public.broadcast_work_periods (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts(id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz,
  source text not null default 'resume' check (source in ('initial','resume')),
  recorded_at timestamptz not null default now(),
  constraint broadcast_work_period_valid check (ended_at is null or ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS broadcast_work_period_history_idx
  ON public.broadcast_work_periods(broadcast_id,started_at);
CREATE UNIQUE INDEX IF NOT EXISTS broadcast_work_period_one_open_idx
  ON public.broadcast_work_periods(broadcast_id) WHERE ended_at IS NULL;
ALTER TABLE public.broadcast_work_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.broadcast_work_periods FROM public,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.broadcast_work_periods TO service_role;

CREATE OR REPLACE FUNCTION public.ruru_admin_set_broadcast_pause_period(p_broadcast_id uuid,p_paused boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $fn$
DECLARE
  b public.broadcasts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_prev_paused boolean;
  v_last uuid;
  v_started timestamptz;
BEGIN
  IF p_broadcast_id IS NULL OR p_paused IS NULL THEN
    RAISE EXCEPTION 'Broadcast ID and paused state are required' USING errcode='P0001';
  END IF;
  SELECT * INTO b FROM public.broadcasts WHERE id=p_broadcast_id FOR UPDATE;
  IF NOT FOUND OR b.is_deleted IS TRUE OR b.status <> 'ON' THEN
    RAISE EXCEPTION 'Active broadcast was not found' USING errcode='P0001';
  END IF;
  v_started := coalesce(b.started_at,b.created_at,v_now);
  v_prev_paused := b.paused_at IS NOT NULL AND b.paused_at >= v_started;
  IF NOT EXISTS (SELECT 1 FROM public.broadcast_work_periods WHERE broadcast_id=p_broadcast_id) THEN
    INSERT INTO public.broadcast_work_periods (broadcast_id,started_at,ended_at,source)
    VALUES (p_broadcast_id,least(v_started,v_now),CASE WHEN v_prev_paused THEN b.paused_at ELSE NULL END,'initial');
  END IF;
  IF v_prev_paused = p_paused THEN
    RETURN pg_catalog.jsonb_build_object('paused_at',b.paused_at,'unchanged',true);
  END IF;
  IF p_paused THEN
    UPDATE public.broadcast_work_periods SET ended_at=v_now
      WHERE broadcast_id=p_broadcast_id AND ended_at IS NULL;
    UPDATE public.broadcasts SET paused_at=v_now WHERE id=p_broadcast_id;
    RETURN pg_catalog.jsonb_build_object('paused_at',v_now,'unchanged',false);
  END IF;
  INSERT INTO public.broadcast_work_periods(broadcast_id,started_at,source)
    VALUES(p_broadcast_id,v_now,'resume') RETURNING id INTO v_last;
  UPDATE public.broadcasts SET paused_at=NULL WHERE id=p_broadcast_id;
  RETURN pg_catalog.jsonb_build_object('paused_at',NULL,'unchanged',false,'period_id',v_last);
END $fn$;
REVOKE ALL ON FUNCTION public.ruru_admin_set_broadcast_pause_period(uuid,boolean) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ruru_admin_set_broadcast_pause_period(uuid,boolean) TO service_role;
