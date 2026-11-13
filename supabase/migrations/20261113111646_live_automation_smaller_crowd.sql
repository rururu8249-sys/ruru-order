-- Owner's revised range: ordinary 2–30 viewers, occasional peak around 50.
alter table public.live_automation_campaigns alter column max_active set default 50;
update public.live_automation_campaigns set max_active=least(max_active,50),population_plan=null;
do $$declare original text;changed text;begin
 select pg_get_functiondef('public.live_automation_population_step(uuid,bigint,jsonb)'::regprocedure) into original;
 changed:=replace(original,'''target'',50,','''target'',16,');
 changed:=replace(changed,'90+floor(random()*11)::int','42+floor(random()*9)::int');
 changed:=replace(changed,'42+floor(random()*17)::int','2+floor(random()*29)::int');
 changed:=replace(changed,'10+floor(random()*21)::int','2+floor(random()*9)::int');
 changed:=replace(changed,'target:=least(c.max_active,greatest(1,','target:=least(50,c.max_active,greatest(2,');
 changed:=replace(changed,'remove_n:=least(8,n-target);','remove_n:=least(2+floor(random()*3)::int,n-target);');
 changed:=replace(changed,'1..least(15,target-n)','1..least(2+floor(random()*3)::int,target-n)');
 if changed=original or position('2+floor(random()*29)' in changed)=0 or position('least(50,c.max_active' in changed)=0 then raise exception 'SMALL_CROWD_PATCH_DRIFT';end if;
 execute changed;
end $$;
