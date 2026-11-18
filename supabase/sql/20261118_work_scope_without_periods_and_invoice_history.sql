-- Recorded in production via Supabase migration remove_auto_work_periods_and_add_invoice_audit_20261118.
-- Idempotent schema reference for new environments. No historical order/picking records are deleted.
CREATE OR REPLACE FUNCTION public.ruru_admin_set_broadcast_pause_period(
 p_broadcast_id uuid,p_paused boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path TO ''
AS $ruru$
DECLARE b public.broadcasts%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();
 v_started timestamptz;
 v_prev boolean;
BEGIN
 IF p_broadcast_id IS NULL OR p_paused IS NULL THEN
  RAISE EXCEPTION 'Broadcast ID and paused state are required' USING errcode='P0001';
 END IF;
 SELECT * INTO b FROM public.broadcasts WHERE id=p_broadcast_id FOR UPDATE;
 IF NOT FOUND OR b.is_deleted IS TRUE OR b.status<>'ON' THEN
  RAISE EXCEPTION 'Active broadcast was not found' USING errcode='P0001';
 END IF;
 v_started:=COALESCE(b.started_at,b.created_at,v_now);
 v_prev:=b.paused_at IS NOT NULL AND b.paused_at>=v_started;
 IF v_prev=p_paused THEN
  RETURN pg_catalog.jsonb_build_object('paused_at',b.paused_at,'unchanged',true);
 END IF;
 UPDATE public.broadcasts SET paused_at=CASE WHEN p_paused THEN v_now ELSE NULL END
 WHERE id=p_broadcast_id;
 RETURN pg_catalog.jsonb_build_object('paused_at',CASE WHEN p_paused THEN v_now ELSE NULL END,'unchanged',false);
END
$ruru$;
CREATE TABLE IF NOT EXISTS public.admin_invoice_export_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 scope_kind text NOT NULL CHECK(scope_kind IN ('current','broadcast','shop','selected')),
 scope_label text NOT NULL CHECK(length(scope_label) BETWEEN 1 AND 180),
 export_mode text NOT NULL CHECK(export_mode IN ('new','paid','selected','all')),
 order_count integer NOT NULL CHECK(order_count BETWEEN 1 AND 5000),
 line_count integer NOT NULL CHECK(line_count>=0),
 order_snapshot jsonb NOT NULL CHECK(jsonb_typeof(order_snapshot)='array')
);
CREATE INDEX IF NOT EXISTS admin_invoice_export_history_created_idx
 ON public.admin_invoice_export_history(created_at DESC);
ALTER TABLE public.admin_invoice_export_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_invoice_export_history FROM anon,authenticated;
GRANT SELECT,INSERT ON public.admin_invoice_export_history TO service_role;
-- After the retiring UI/API has deployed, remove the unused manual-split RPC separately.
