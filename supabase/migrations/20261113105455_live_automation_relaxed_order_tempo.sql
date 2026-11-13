-- Owner correction: ordinary periods contain 1–3 orders with variable gaps and long quiet periods.
create or replace function public.live_automation_plan_tempo(p_campaign uuid,p_quiet boolean default false) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; mode text; pick double precision:=random(); delay integer; offsets jsonb; plan jsonb; begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 if c.id is null then raise exception 'NO_CAMPAIGN'; end if;
 if not c.orders_enabled then update public.live_automation_campaigns set next_order_at=null,tempo_plan=null where id=c.id; return null; end if;
 mode:=case when p_quiet or c.tempo_plan->>'mode'='burst' then 'quiet'
 when not p_quiet and c.tempo_plan is null then 'startup'
 when pick<.25 then 'quiet' when pick<.75 then 'steady' when pick<.95 then 'busy' else 'burst' end;
 delay:=case mode when 'startup' then 45+floor(random()*46)::int when 'quiet' then 1200+floor(random()*601)::int
 when 'steady' then 480+floor(random()*421)::int when 'busy' then 480+floor(random()*421)::int else 600+floor(random()*601)::int end;
 if mode='steady' then
 select jsonb_agg(i*(90000+floor(random()*90001)::int) order by i) into offsets from generate_series(0,floor(random()*3)::int) i;
 elsif mode='busy' then
 select jsonb_agg(i*(30000+floor(random()*60001)::int) order by i) into offsets from generate_series(0,1+floor(random()*2)::int) i;
 elsif mode='burst' then
 select jsonb_agg(i*(30000+floor(random()*45001)::int) order by i) into offsets from generate_series(0,2+floor(random()*3)::int) i;
 else offsets:='[0]'::jsonb; end if;
 plan:=jsonb_build_object('id',gen_random_uuid(),'mode',mode,'at',clock_timestamp()+make_interval(secs=>delay),'offsets',offsets,'revision',c.revision);
 update public.live_automation_campaigns set tempo_plan=plan,next_order_at=(plan->>'at')::timestamptz where id=c.id; return plan;
end $$;
do $$ declare original text; source text; c record; a record; due timestamptz; begin
 perform public.live_automation_identity_lock();
 select pg_get_functiondef('public.live_automation_order_admission(uuid,uuid)'::regprocedure) into original;
 source:=replace(original,')>=120',')>=12');
 if source=original then raise exception 'RELAXED_ADMISSION_PATCH_DRIFT'; end if; execute source;
 -- Existing unasked journeys are spread too. Preserve published question promises and in-flight work.
 for c in select * from public.live_automation_campaigns where orders_enabled for update loop
  due:=clock_timestamp()+interval '8 minutes';
  for a in select * from public.live_automation_actions where campaign_id=c.id and kind='order' and not manual and status='pending' and asked_at is null order by due_at for update loop
   due:=due+make_interval(secs=>floor(random()*241)::int);
   update public.live_automation_actions set due_at=due,plan=plan||jsonb_build_object('submitAt',due+interval '1 minute') where id=a.id;
   update public.live_automation_sessions set leave_at=greatest(leave_at,due+interval '5 minutes') where id=a.session_id and stopped_at is null;
   due:=due+interval '8 minutes';
  end loop;
  perform public.live_automation_plan_tempo(c.id,true);
 end loop;
end $$;
revoke all on function public.live_automation_plan_tempo(uuid,boolean) from public,anon,authenticated;
grant execute on function public.live_automation_plan_tempo(uuid,boolean) to service_role;
