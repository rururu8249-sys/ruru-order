-- Ordinary orders remain central; intermediate activity and gradual post-burst recovery.
create or replace function public.live_automation_plan_tempo(p_campaign uuid,p_quiet boolean default false) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; mode text; pick double precision:=random(); delay integer; offsets jsonb; plan jsonb; begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 if c.id is null then raise exception 'NO_CAMPAIGN'; end if;
 if not c.orders_enabled then update public.live_automation_campaigns set next_order_at=null,tempo_plan=null where id=c.id; return null; end if;
 mode:=case when not p_quiet and c.tempo_plan is null then 'startup'
 when p_quiet then 'quiet'
 when c.tempo_plan->>'mode'='burst' then case when pick<.25 then 'quiet' else 'steady' end
 when c.population_plan->>'phase'='spike' then 'burst'
 when pick<.2 then 'quiet' when pick<.65 then 'steady' when pick<.9 then 'busy' else 'burst' end;
 delay:=case mode when 'startup' then 45+floor(random()*46)::int when 'quiet' then 180+floor(random()*301)::int when 'steady' then 35+floor(random()*66)::int when 'busy' then 25+floor(random()*41)::int else 15+floor(random()*21)::int end;
 if mode='burst' then
   select jsonb_agg(offset_ms order by offset_ms) into offsets from (select floor(random()*90001)::int offset_ms from generate_series(1,4+floor(random()*5)::int)) x;
 elsif mode='busy' then
   select jsonb_agg(offset_ms order by offset_ms) into offsets from (select floor(random()*60001)::int offset_ms from generate_series(1,2+floor(random()*2)::int)) x;
 elsif mode='steady' then
   select jsonb_agg(offset_ms order by offset_ms) into offsets from (select floor(random()*45001)::int offset_ms from generate_series(1,1+floor(random()*2)::int)) x;
 else offsets:='[0]'::jsonb; end if;
 plan:=jsonb_build_object('id',gen_random_uuid(),'mode',mode,'at',clock_timestamp()+make_interval(secs=>delay),'offsets',offsets,'revision',c.revision);
 update public.live_automation_campaigns set tempo_plan=plan,next_order_at=(plan->>'at')::timestamptz where id=c.id; return plan;
end $$;
