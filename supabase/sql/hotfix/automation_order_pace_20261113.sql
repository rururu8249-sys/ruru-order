-- [2026-11-13 23:06 사장님] 테스트 주문 양 적게/보통/많게 — settings.live_automation_order_pace 만 읽어 간격 조절. 그 밖은 20261113105455 와 동일.
create or replace function public.live_automation_plan_tempo(p_campaign uuid,p_quiet boolean default false) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare c public.live_automation_campaigns; mode text; pick double precision:=random(); delay integer; offsets jsonb; plan jsonb; pace text; begin
 perform public.live_automation_identity_lock();
 select * into c from public.live_automation_campaigns where id=p_campaign for update;
 if c.id is null then raise exception 'NO_CAMPAIGN'; end if;
 if not c.orders_enabled then update public.live_automation_campaigns set next_order_at=null,tempo_plan=null where id=c.id; return null; end if;
 select nullif(trim(both '"' from trim(value::text)),'') into pace from public.settings where key='live_automation_order_pace';
 pace:=coalesce(pace,'normal');
 mode:=case when p_quiet or c.tempo_plan->>'mode'='burst' then 'quiet'
 when not p_quiet and c.tempo_plan is null then 'startup'
 when pace='low' then case when pick<.5 then 'quiet' else 'steady' end
 when pace='high' then case when pick<.05 then 'quiet' when pick<.4 then 'steady' when pick<.8 then 'busy' else 'burst' end
 when pick<.25 then 'quiet' when pick<.75 then 'steady' when pick<.95 then 'busy' else 'burst' end;
 delay:=case mode when 'startup' then 45+floor(random()*46)::int when 'quiet' then 1200+floor(random()*601)::int
 when 'steady' then 480+floor(random()*421)::int when 'busy' then 480+floor(random()*421)::int else 600+floor(random()*601)::int end;
 if pace='low' then delay:=round(delay*1.6)::int; elsif pace='high' then delay:=greatest(30,round(delay*0.45)::int); end if;
 if mode='steady' then
 select jsonb_agg(i*(90000+floor(random()*90001)::int) order by i) into offsets from generate_series(0,case when pace='low' then floor(random()*2)::int else floor(random()*3)::int end) i;
 elsif mode='busy' then
 select jsonb_agg(i*(30000+floor(random()*60001)::int) order by i) into offsets from generate_series(0,1+floor(random()*2)::int) i;
 elsif mode='burst' then
 select jsonb_agg(i*(30000+floor(random()*45001)::int) order by i) into offsets from generate_series(0,2+floor(random()*3)::int) i;
 else offsets:='[0]'::jsonb; end if;
 plan:=jsonb_build_object('id',gen_random_uuid(),'mode',mode,'at',clock_timestamp()+make_interval(secs=>delay),'offsets',offsets,'revision',c.revision);
 update public.live_automation_campaigns set tempo_plan=plan,next_order_at=(plan->>'at')::timestamptz where id=c.id; return plan;
end $$;
