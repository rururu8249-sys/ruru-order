-- The shared table now stores survival/race/claw schedules, not only roulette.
-- Their durations are computed by lib/eventPlayback.ts and may exceed 10s;
-- an all-winners schedule can also be 1ms. Keep the original roulette bounds.
-- No event, winner, order, balance or ledger rows are changed.
begin;
set local lock_timeout = '5s';
alter table public.event_roulette_events
  drop constraint if exists event_roulette_events_spin_duration_ms_check;
alter table public.event_roulette_events
  add constraint event_roulette_events_spin_duration_ms_check check (
    spin_duration_ms >= 1 and (
      overlay_token like 'survival\_%' escape '\' or
      overlay_token like 'race\_%' escape '\' or
      overlay_token like 'claw\_%' escape '\' or
      spin_duration_ms between 1000 and 10000
    )
  );
commit;
