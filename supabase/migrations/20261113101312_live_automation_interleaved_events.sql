-- Spread delayed receipts across dispatches instead of emitting a three-message block.
do $$ declare original text; source text; begin
 select pg_get_functiondef('public.live_automation_drain_payments(uuid,bigint)'::regprocedure) into original;
 source:=replace(original,'order by due_at limit 3 for update','order by due_at limit 1 for update');
 if source=original then raise exception 'PAYMENT_PACING_PATCH_DRIFT'; end if;
 execute source;
end $$;
