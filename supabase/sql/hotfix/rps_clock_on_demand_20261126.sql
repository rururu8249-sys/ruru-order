-- ============================================================
-- [2026-11-26] 가위바위보 1초 시계를 «게임 있을 때만» 돌게 (사장님 「당장 해결」)
--   전: cron ruru-rps-clock 이 게임이 없어도 1초마다 rps_tick() — 9일간 69만 번·cron 기록 56MB, DB 바쁨 원인 중 하나.
--   후: ① 게임 방(rps_rooms)이 생기거나 열린 상태로 바뀌면 시계를 켠다(트리거).
--       ② rps_tick() 이 «열린 방 없음 + 지급 대기 당첨자 없음»을 보면 시계를 스스로 끈다.
--   게임 진행·보상 지급 계산(rps_settle·rps_reward 등)은 그대로. rps_tick 원문에서 문장 1개만 바꾸고, 못 찾으면 통째로 멈춤.
--   시계 켜기/끄기는 rps_admin 과 같은 자물쇠(84266710) 안에서 일어나 서로 엇갈리지 않는다.
-- ============================================================

create or replace function public.rps_clock_ensure() returns void
language plpgsql security definer set search_path = public, cron as $$
begin
  if not exists (select 1 from cron.job where jobname = 'ruru-rps-clock') then
    perform cron.schedule('ruru-rps-clock', '1 second', 'select public.rps_tick()');
  end if;
exception when others then
  raise warning 'rps_clock_ensure: %', sqlerrm; -- 시계 켜기 실패가 게임 만들기를 막지 않게
end $$;

create or replace function public.rps_clock_stop() returns void
language plpgsql security definer set search_path = public, cron as $$
begin
  if exists (select 1 from cron.job where jobname = 'ruru-rps-clock') then
    perform cron.unschedule('ruru-rps-clock');
  end if;
exception when others then
  raise warning 'rps_clock_stop: %', sqlerrm;
end $$;

revoke all on function public.rps_clock_ensure() from public, anon, authenticated;
revoke all on function public.rps_clock_stop() from public, anon, authenticated;

create or replace function public.rps_rooms_clock_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'closed' then perform public.rps_clock_ensure(); end if;
  return new;
end $$;

drop trigger if exists rps_rooms_clock_on on public.rps_rooms;
create trigger rps_rooms_clock_on after insert or update of status, deadline on public.rps_rooms
  for each row execute function public.rps_rooms_clock_trg();

do $$
declare
  d text;
  a text := ' if r.id is null then return;end if;';
begin
  d := pg_get_functiondef('public.rps_tick()'::regprocedure);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'rps_tick 문장을 정확히 1번 찾지 못함'; end if;
  d := replace(d, a, ' if r.id is null then
  if not exists(select 1 from rps_players p join rps_rooms x on x.id=p.room_id where x.status=''closed'' and p.winner and p.reward_status=''pending'') then perform public.rps_clock_stop(); end if;
  return;end if;');
  execute d;
end $$;

-- 지금 열린 방·지급 대기가 없으면 바로 시계 끄기
select case when exists(select 1 from rps_rooms where status<>'closed')
              or exists(select 1 from rps_players p join rps_rooms x on x.id=p.room_id where x.status='closed' and p.winner and p.reward_status='pending')
            then 'keep' else (select 'stopped' from (select public.rps_clock_stop()) s) end as clock_now;

-- 확인
select
  (select count(*) from cron.job where jobname='ruru-rps-clock') as clock_jobs,
  (select count(*) from pg_trigger where tgname='rps_rooms_clock_on') as trigger_on,
  (select position('rps_clock_stop' in pg_get_functiondef('public.rps_tick()'::regprocedure))>0) as tick_patched,
  (select count(*) from rps_rooms where status<>'closed') as open_rooms;
