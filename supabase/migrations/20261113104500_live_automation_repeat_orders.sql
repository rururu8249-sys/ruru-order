-- Per-person repeat orders must not follow the room-wide burst clock.
alter table public.live_automation_actors drop constraint live_automation_actors_order_target_check;
alter table public.live_automation_actors drop constraint live_automation_actors_order_count_check;
alter table public.live_automation_actors add constraint live_automation_actors_order_target_check check(order_target between 0 and 6);
alter table public.live_automation_actors add constraint live_automation_actors_order_count_check check(order_count between 0 and 6);
alter table public.live_automation_actors add column next_order_after timestamptz;
create or replace function public.live_automation_order_target() returns integer language plpgsql volatile set search_path=public as $$
declare r float8:=random();begin
 return case when r<.65 then 1 when r<.88 then 2 when r<.97 then 3 else 4+floor((r-.97)/.03*3)::integer end;
end $$;
create or replace function public.live_automation_repeat_cooldown() returns trigger language plpgsql set search_path=public as $$
declare r float8:=random();begin
 if new.order_count>old.order_count then
  new.next_order_after:=clock_timestamp()+make_interval(secs=>round(case when r<.8 then 8+r*24 else 30+(r-.8)*150 end*60)::int);
 end if;return new;
end $$;
create trigger live_automation_repeat_cooldown before update of order_count on public.live_automation_actors for each row execute function public.live_automation_repeat_cooldown();
update public.live_automation_actors set next_order_after=clock_timestamp()+make_interval(secs=>480+floor(random()*1321)::int) where order_count>0;
update public.live_automation_actors set order_target=public.live_automation_order_target() where order_count=0 and order_target>0;
create or replace function public.live_automation_repeat_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if new.kind='order' and not new.manual and exists(select 1 from public.live_automation_actors where id=new.actor_id and next_order_after>clock_timestamp()) then raise exception 'ACTOR_ORDER_COOLDOWN';end if;
 return new;
end $$;
create trigger live_automation_repeat_guard before insert on public.live_automation_actions for each row execute function public.live_automation_repeat_guard();
do $$declare def text;begin
 select pg_get_functiondef('public.live_automation_population_step(uuid,bigint,jsonb)'::regprocedure) into def;
 if position('1+floor(random()*3)::int' in def)=0 then raise exception 'POPULATION_TARGET_SHAPE_CHANGED';end if;
 execute replace(def,'1+floor(random()*3)::int','public.live_automation_order_target()');
end $$;
revoke all on function public.live_automation_order_target(),public.live_automation_repeat_cooldown(),public.live_automation_repeat_guard() from public,anon,authenticated;
grant execute on function public.live_automation_order_target() to service_role;
