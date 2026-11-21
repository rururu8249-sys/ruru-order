-- The administrator percent replaces the superseded six-per-hour limit.
-- Live detection matches streamModeOf: explicit pause takes priority over the
-- three-minute YouTube viewer cache. No order/payment/customer data is changed.
create or replace function public.live_automation_chat_policy(p_broadcast uuid)
returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare raw text; legacy text; pct integer; phase text:='replay'; b record;
 cache jsonb; stamp timestamptz; lo integer; hi integer; min_ms integer; max_ms integer;
 fraction numeric; chance numeric; factor numeric;
 points integer[]:=array[0,20,50,80,100];
 mins integer[]:=array[900000,120000,45000,20000,15000];
 maxs integer[]:=array[1200000,240000,90000,40000,30000];
 chances numeric[]:=array[0,.6,.75,.95,.98];
begin
 select trim(replace(value,'"','')) into raw from public.settings where key='live_automation_chat_rate_pct';
 select trim(replace(value,'"','')) into legacy from public.settings where key='live_automation_chat_pace';
 pct:=case legacy when 'low' then 20 when 'high' then 80 else 50 end;
 if raw ~ '^\d{1,3}$' and raw::integer between 0 and 100 then pct:=raw::integer;end if;
 select status,paused_at,started_at into b from public.broadcasts where id=p_broadcast;
 if upper(b.status)='ON' and b.paused_at is not null and b.paused_at>=coalesce(b.started_at,'epoch'::timestamptz) then phase:='paused';
 else
  begin
   select value::jsonb into cache from public.settings where key='live_viewers_now';
   stamp:=(cache->>'t')::timestamptz;
   if cache->>'bc'=p_broadcast::text and cache->>'v' is not null and stamp>now()-interval '3 minutes' then phase:='live';end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then phase:='replay';end;
 end if;
 if pct=0 then min_ms:=3600000;max_ms:=3600000;chance:=0;
 else
  for hi in 2..5 loop
   if pct<=points[hi] then
    lo:=hi-1;fraction:=(pct-points[lo])::numeric/(points[hi]-points[lo]);
    min_ms:=round(mins[lo]+(mins[hi]-mins[lo])*fraction);
    max_ms:=round(maxs[lo]+(maxs[hi]-maxs[lo])*fraction);
    chance:=chances[lo]+(chances[hi]-chances[lo])*fraction;exit;
   end if;
  end loop;
 end if;
 factor:=case when phase='live' then 1 else 2.4 end;
 min_ms:=greatest(case when phase='live' then 60000 else 120000 end,round(min_ms*factor));
 max_ms:=greatest(min_ms,round(max_ms*factor));
 return jsonb_build_object('percent',pct,'mode',phase,'gapMin',min_ms,'gapMax',max_ms,
  'humanQuietMs',case when pct<=20 then 90000 else 60000 end,'chance',case when phase='live' then chance else least(.65,chance*.65) end);
end $$;
revoke all on function public.live_automation_chat_policy(uuid) from public,anon,authenticated;
grant execute on function public.live_automation_chat_policy(uuid) to service_role;

create or replace function public.live_automation_ai_admission(p_actor uuid,p_kind text)
returns void language plpgsql set search_path=pg_catalog,public as $$
declare a public.live_automation_actors; c public.live_automation_campaigns; t timestamptz:=clock_timestamp();
 policy jsonb; total_minute integer; proactive_minute integer; last_ai timestamptz; last_actor timestamptz;
 min_gap interval; max_gap interval;
begin
 perform public.live_automation_assert_ai(p_actor);
 select * into a from public.live_automation_actors where id=p_actor;
 -- Serialize room admission: parallel actors cannot both consume the same slot.
 select * into c from public.live_automation_campaigns where id=a.campaign_id for update;
 policy:=public.live_automation_chat_policy(c.broadcast_id);
 if (policy->>'percent')::int=0 then raise exception 'CHAT_RATE_ZERO';end if;
 if p_kind not in('reply','chat','question') then raise exception 'INVALID_AI_KIND';end if;
 min_gap:=make_interval(secs=>(policy->>'gapMin')::numeric/1000);
 max_gap:=make_interval(secs=>(policy->>'gapMax')::numeric/1000);
 select count(*) filter(where m.created_at>t-interval '1 minute'),
 count(*) filter(where m.created_at>t-interval '1 minute' and x.kind<>'reply'),
 max(m.created_at),max(m.created_at) filter(where x.actor_id=p_actor)
 into total_minute,proactive_minute,last_ai,last_actor
 from public.live_chat_messages m join public.live_automation_actions x on x.id=m.automation_action_id
 where x.campaign_id=a.campaign_id and x.kind in('chat','question','reply') and m.created_at>t-interval '3 hours';
 if total_minute>=2 then raise exception 'CHAT_MINUTE_LIMIT';end if;
 if p_kind<>'reply' then
  if exists(select 1 from public.live_chat_messages m where m.broadcast_id=c.broadcast_id
    and m.automation_actor_id is null and m.badge is distinct from 'bot' and m.hidden_at is null
    and m.created_at>t-make_interval(secs=>(policy->>'humanQuietMs')::double precision/1000)) then raise exception 'HUMAN_CONVERSATION_ACTIVE';end if;
  if c.auto_chat_after is not null and least(c.auto_chat_after,coalesce(last_ai,t-max_gap)+max_gap)>t then raise exception 'ROOM_CHAT_REST';end if;
  if proactive_minute>=1 or last_ai+min_gap>t
    or (a.proactive_quiet_until is not null and least(a.proactive_quiet_until,coalesce(last_actor,t-2*max_gap)+2*max_gap)>t)
    then raise exception 'CHAT_QUIET_WINDOW';end if;
 end if;
end $$;

create or replace function public.live_automation_room_chat_rest()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare a public.live_automation_actions; policy jsonb; delay double precision;
begin
 if new.automation_action_id is null or new.badge='bot' or new.hidden_at is not null then return new;end if;
 select * into a from public.live_automation_actions where id=new.automation_action_id;
 if a.kind not in('chat','question','reply') then return new;end if;
 policy:=public.live_automation_chat_policy(new.broadcast_id);
 delay:=((policy->>'gapMin')::double precision+random()*((policy->>'gapMax')::double precision-(policy->>'gapMin')::double precision))/1000;
 update public.live_automation_campaigns set auto_chat_after=clock_timestamp()+make_interval(secs=>delay) where id=a.campaign_id;
 return new;
end $$;

create or replace function public.live_automation_failed_chat_rest()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare policy jsonb; bc uuid;
begin
 if new.kind in('chat','question','reply') and new.status in('skipped','failed') and old.status is distinct from new.status
 and coalesce(new.result->>'message','')<>'SILENT' then
  select broadcast_id into bc from public.live_automation_campaigns where id=new.campaign_id;
  policy:=public.live_automation_chat_policy(bc);
  update public.live_automation_campaigns set auto_chat_after=greatest(auto_chat_after,clock_timestamp()+make_interval(secs=>least(60,(policy->>'gapMin')::double precision/2000))) where id=new.campaign_id;
 end if;return new;
end $$;

-- Preserve all production notice/identity validation branches verbatim.
do $$ declare source text; old_fragment text:='make_interval(secs=>300+floor(random()*601)::int)';
begin
 source:=pg_get_functiondef('public.live_automation_sparse_chat_guard()'::regprocedure);
 if position(old_fragment in source)=0 then raise exception 'SPARSE_CHAT_GUARD_DRIFT';end if;
 execute replace(source,old_fragment,'make_interval(secs=>2*(public.live_automation_chat_policy(new.broadcast_id)->>''gapMax'')::double precision/1000)');
end $$;
