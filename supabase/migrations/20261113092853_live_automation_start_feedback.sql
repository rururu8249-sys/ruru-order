-- First start/restart uses one quick order; later quiet/steady/burst tempo is unchanged.
create or replace function public.live_automation_plan_tempo(p_campaign uuid,p_quiet boolean default false) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; mode text; pick double precision:=random(); delay integer; offsets jsonb; plan jsonb; begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 if c.id is null then raise exception 'NO_CAMPAIGN'; end if;
 if not c.orders_enabled then
   update public.live_automation_campaigns set next_order_at=null,tempo_plan=null where id=c.id; return null;
 end if;
 mode:=case when not p_quiet and c.tempo_plan is null then 'startup' when p_quiet or c.tempo_plan->>'mode'='burst' or pick<.35 then 'quiet' when pick<.85 then 'steady' else 'burst' end;
 delay:=case mode when 'startup' then 45+floor(random()*46)::int when 'quiet' then 480+floor(random()*721)::int when 'steady' then 60+floor(random()*301)::int else 15+floor(random()*31)::int end;
 if mode='burst' then
   select jsonb_agg(offset_ms order by offset_ms) into offsets from (select floor(random()*45001)::int offset_ms from generate_series(1,2+floor(random()*2)::int)) x;
 else offsets:='[0]'::jsonb; end if;
 plan:=jsonb_build_object('id',gen_random_uuid(),'mode',mode,'at',clock_timestamp()+make_interval(secs=>delay),'offsets',offsets,'revision',c.revision);
 update public.live_automation_campaigns set tempo_plan=plan,next_order_at=(plan->>'at')::timestamptz where id=c.id;
 return plan;
end $$;

do $$
declare original text; changed text; marker text:='perform public.live_automation_plan_tempo(c.id,false);'; begin
 select pg_get_functiondef('public.live_automation_control(uuid,text,boolean,bigint)'::regprocedure) into original;
 if length(original)-length(replace(original,marker,''))<>length(marker) then raise exception 'CONTROL_START_PATCH_DRIFT'; end if;
 changed:=replace(original,marker,'update public.live_automation_campaigns set tempo_plan=null where id=c.id; '||marker);
 execute changed;
end $$;
revoke all on function public.live_automation_plan_tempo(uuid,boolean) from public,anon,authenticated;
grant execute on function public.live_automation_plan_tempo(uuid,boolean) to service_role;
