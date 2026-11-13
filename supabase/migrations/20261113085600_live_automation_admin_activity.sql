-- Read-only projection into the existing admin cart/presence screens.
-- No inventory reservation, customer identity rewrite or external notification.
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
    'created_at',h.expires_at-interval '5 minutes','expires_at',h.expires_at) as row
  from active s join public.live_automation_cart_holds h on h.session_id=s.id
  cross join lateral jsonb_array_elements(h.items) with ordinality x(item,ordinality)
  where h.expires_at>now()
 ) select jsonb_build_object(
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'actorId',actor_id,'visitorKey',visitor_key)) from active),'[]'::jsonb),
   'holds',coalesce((select jsonb_agg(row) from holds),'[]'::jsonb));
$$;
revoke all on function public.live_automation_admin_activity() from public,anon,authenticated;
grant execute on function public.live_automation_admin_activity() to service_role;
