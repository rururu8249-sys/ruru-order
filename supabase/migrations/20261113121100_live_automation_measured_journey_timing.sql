-- Empirical timing calibration; no customer identifiers or order data are embedded.
-- Cart sample n=27 (retained client activity + saved order), bank n=48/card n=21
-- confirmed groups Nov 6–13. Keep long tails instead of silently trimming the mean.
create or replace function public.live_automation_timing_seconds(p_kind text,p_draw double precision default random())
returns double precision language plpgsql immutable set search_path=pg_catalog,public as $$
declare samples double precision[]; begin
 if p_draw is null or p_draw<0 or p_draw>=1 then raise exception 'INVALID_TIMING_DRAW'; end if;
 case p_kind
 when 'cart' then samples:=array[16.932, 39.912, 46.548, 48.078, 57.654, 67.548, 68.034, 72.972, 78.576, 87.984, 95.142, 142.08, 142.908, 164.91, 219.126, 243.642, 244.602, 299.214, 440.16, 499.11, 549.006, 558.918, 613.422, 635.142, 1096.77, 1302.702, 3864.834]::double precision[];
 when 'bank' then samples:=array[101.43, 110.532, 152.778, 174.444, 177.774, 178.452, 179.292, 180.108, 189.222, 205.788, 207.948, 211.536, 238.812, 252.102, 253.866, 264.87, 270.774, 272.454, 274.266, 304.482, 313.314, 319.908, 319.956, 329.826, 330.924, 339.216, 342.234, 348.552, 372.456, 380.502, 406.428, 415.794, 433.002, 439.062, 448.686, 519.18, 531.534, 614.82, 726.534, 731.904, 834.348, 952.542, 1006.482, 1106.01, 1963.434, 3343.26, 7951.116, 169299.162]::double precision[];
 when 'card' then samples:=array[270.678, 304.656, 328.986, 525.888, 540.108, 577.524, 634.29, 702.012, 710.754, 735.852, 746.574, 913.71, 1044.738, 1150.134, 1306.35, 2304.936, 2770.854, 4494.156, 4894.224, 8257.458, 50482.326]::double precision[];
 else raise exception 'INVALID_TIMING_KIND'; end case;
 return samples[1+floor(p_draw*array_length(samples,1))::int];
end $$;
revoke all on function public.live_automation_timing_seconds(text,double precision) from public,anon,authenticated;
grant execute on function public.live_automation_timing_seconds(text,double precision) to service_role;

-- Existing workers may still send the former short deadline. The server owns timing;
-- each claim persists its chosen duration exactly once, measured AFTER the cart write.
create or replace function public.live_automation_stage_order(p_action uuid,p_lease uuid,p_revision bigint,p_submit_at timestamptz) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare ctx jsonb; a public.live_automation_actions; due timestamptz; delay double precision; sid uuid; begin
 ctx:=public.live_automation_assert_claim(p_action,p_lease,p_revision,'order');
 sid:=(ctx->'session'->>'id')::uuid;
 if not exists(select 1 from public.live_automation_cart_holds where session_id=sid and expires_at>clock_timestamp()) then raise exception 'CART_EXPIRED'; end if;
 delay:=public.live_automation_timing_seconds('cart'); due:=clock_timestamp()+make_interval(secs=>delay);
 -- Keep the isolated cart/session valid through the scheduled submission, without
 -- reserving real inventory or keeping a server function alive during the wait.
 update public.live_automation_sessions set leave_at=greatest(leave_at,due+interval '3 minutes') where id=sid;
 update public.live_automation_cart_holds set expires_at=greatest(expires_at,due+interval '3 minutes') where session_id=sid;
 update public.live_automation_actions set status='pending',lease_token=null,lease_until=null,due_at=due,
 plan=plan||jsonb_build_object('stage','submit','submitAt',due,'cartStartedAt',clock_timestamp(),'cartDelaySeconds',delay,'timingVersion','2026-11-13-real-v1')
 where id=p_action returning * into a;
 return to_jsonb(a);
end $$;

-- Change only the isolated receipt queue's delay; actual bank/card states are untouched.
do $$ declare original text; source text; begin
 select pg_get_functiondef('public.live_automation_queue_payment()'::regprocedure) into original;
 source:=replace(original,'45+floor(random()*376)::int',
 'public.live_automation_timing_seconds(case when method=''카드결제'' then ''card'' else ''bank'' end)');
 if source=original then raise exception 'PAYMENT_TIMING_PATCH_DRIFT'; end if;
 execute source;
end $$;

-- Re-time unsent receipts once. Already sent/skipped/cancelled events stay untouched.
-- The drain still checks ON, broadcast, saved order and emits at most one per dispatch.
update public.live_automation_payment_events e set due_at=greatest(
 clock_timestamp()+make_interval(secs=>60+random()*240),
 (select min(o.created_at) from public.orders o where o.automation_action_id=e.order_action_id)
 +make_interval(secs=>public.live_automation_timing_seconds(e.kind)))
where e.status='pending' and exists(select 1 from public.orders o where o.automation_action_id=e.order_action_id and o.is_test_order);

-- Existing unclaimed carts adopt the new timing too; never touch in-flight submits
-- or a question already promised a short follow-up window.
do $$ declare a record; due timestamptz; delay double precision; begin
 perform public.live_automation_identity_lock();
 for a in select x.id,x.session_id from public.live_automation_actions x
 join public.live_automation_sessions s on s.id=x.session_id
 join public.live_automation_cart_holds h on h.session_id=s.id
 join public.live_automation_campaigns c on c.id=x.campaign_id
 where x.kind='order' and not x.manual and x.status='pending' and x.plan->>'stage'='submit'
 and x.asked_at is null and s.stopped_at is null and s.leave_at>clock_timestamp()
 and h.expires_at>clock_timestamp() and c.orders_enabled for update of x loop
 delay:=public.live_automation_timing_seconds('cart');due:=clock_timestamp()+make_interval(secs=>delay);
 update public.live_automation_sessions set leave_at=greatest(leave_at,due+interval '3 minutes') where id=a.session_id;
 update public.live_automation_cart_holds set expires_at=greatest(expires_at,due+interval '3 minutes') where session_id=a.session_id;
 update public.live_automation_actions set due_at=due,plan=plan||jsonb_build_object('submitAt',due,'cartStartedAt',clock_timestamp(),'cartDelaySeconds',delay,'timingVersion','2026-11-13-real-v1') where id=a.id;
 end loop;
end $$;

-- Slow individual carts coexist with later waves. Do not reschedule a future
-- wave whenever the last cart happens to finish.
create or replace function public.live_automation_after_submit(p_campaign uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.live_automation_actions where campaign_id=p_campaign and kind='order' and not manual and status in('pending','claimed','uncertain'))
 and exists(select 1 from public.live_automation_actions a join public.live_automation_campaigns c on c.id=a.campaign_id
   where c.id=p_campaign and a.plan->>'waveId'=c.tempo_plan->>'id') then
   perform public.live_automation_plan_tempo(p_campaign,false);
 end if;
end $$;

-- Cart age must never be inferred from an expiry that can be extended.
create or replace function public.live_automation_admin_activity() returns jsonb
language sql stable set search_path=pg_catalog,public as $$
 with active as (
  select s.*,a.nickname from public.live_automation_sessions s
  join public.live_automation_actors a on a.id=s.actor_id
  join public.live_automation_campaigns c on c.id=s.campaign_id
  join public.broadcasts b on b.id=c.broadcast_id
  where s.stopped_at is null and s.leave_at>now() and a.retired_at is null
    and b.status='ON' and b.is_deleted is not true
 ), holds as (
  select jsonb_build_object('id',s.id::text||':'||x.ordinality,'session_key',s.cart_key,
    'automation_actor_id',s.actor_id,'nickname',s.nickname,'customer_name',s.nickname,
    'customer_phone','','kakao_id','','product_id',x.item->>'productId',
    'product_name',x.item->>'productName','detail_name',x.item->>'productName',
    'color',x.item->>'color','size',x.item->>'size','qty',x.item->'qty','unit_price',x.item->'unitPrice',
    'created_at',coalesce((select (a.plan->>'cartStartedAt')::timestamptz from public.live_automation_actions a where a.session_id=s.id and a.kind='order' and a.plan->>'stage'='submit' order by a.created_at desc limit 1),least(h.expires_at-interval '5 minutes',now())),'expires_at',h.expires_at) as row
  from active s join public.live_automation_cart_holds h on h.session_id=s.id
  cross join lateral jsonb_array_elements(h.items) with ordinality x(item,ordinality)
  where h.expires_at>now()
 ) select jsonb_build_object(
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'actorId',actor_id,'visitorKey',visitor_key)) from active),'[]'::jsonb),
   'holds',coalesce((select jsonb_agg(row) from holds),'[]'::jsonb));
$$;
revoke all on function public.live_automation_admin_activity() from public,anon,authenticated;
grant execute on function public.live_automation_admin_activity() to service_role;
