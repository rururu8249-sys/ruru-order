-- Manual replay remains possible after deleting rehearsal orders; AI eligibility is unchanged.
do $$declare def text;begin
 select pg_get_functiondef('public.live_automation_eligibility(uuid)'::regprocedure) into def;
 def:=replace(def,'submitted integer:=0;','submitted integer:=0; archived integer:=0; used boolean:=false;');
 def:=replace(def,'return jsonb_build_object(''manual'',watching or cart or submitted>0',
 'select count(*)::int into archived from public.live_automation_actions where actor_id=a.id and campaign_id=c.id and kind=''order'' and status=''succeeded'';
 select exists(select 1 from public.live_automation_manual_messages where actor_id=a.id and message_id is not null) into used;
 return jsonb_build_object(''manual'',watching or cart or submitted>0 or archived>0 or used');
 def:=replace(def,'''orders'',submitted);','''orders'',greatest(submitted,archived),''used'',used);');
 if position('archived>0 or used' in def)=0 then raise exception 'HISTORY_PATCH_DRIFT';end if;
 execute def;
 select pg_get_functiondef('public.live_automation_population_step(uuid,bigint,jsonb)'::regprocedure) into def;
 def:=replace(def,'plan:=plan||jsonb_build_object(''phase'',''baseline'',''target'',42+floor(random()*17)::int,''until'',t+make_interval(secs=>120+floor(random()*181)::int));',
 'if plan->>''phase''=''baseline'' and coalesce((plan->>''nextLow'')::timestamptz,t)<=t and random()<.2 then
 plan:=plan||jsonb_build_object(''phase'',''low'',''target'',10+floor(random()*21)::int,''until'',t+make_interval(secs=>120+floor(random()*181)::int),''nextLow'',t+make_interval(secs=>1200+floor(random()*1501)::int));
 else
 plan:=plan||jsonb_build_object(''phase'',''baseline'',''target'',42+floor(random()*17)::int,''until'',t+make_interval(secs=>120+floor(random()*181)::int));
 end if;');
 if position('nextLow' in def)=0 then raise exception 'LOW_CROWD_PATCH_DRIFT';end if;
 execute def;
end $$;
