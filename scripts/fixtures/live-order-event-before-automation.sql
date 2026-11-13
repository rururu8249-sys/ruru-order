CREATE OR REPLACE FUNCTION public.ruru_live_order_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n jsonb;
  o jsonb;
begin
  begin
    n := to_jsonb(NEW);
    o := case when TG_OP = 'UPDATE' then to_jsonb(OLD) else '{}'::jsonb end;
    perform realtime.send(
      jsonb_build_object(
        'type', TG_OP,
        'new', jsonb_build_object(
          'id', n->'id',
          'order_group_id', n->'order_group_id',
          'broadcast_id', n->'broadcast_id',
          'youtube_nickname', n->'youtube_nickname',
          'product_name', n->'product_name',
          'color', n->'color',
          'size', n->'size',
          'qty', n->'qty',
          'admin_order_status_v2', n->'admin_order_status_v2',
          'order_manage_status', n->'order_manage_status',
          'deposit_status', n->'deposit_status',
          'is_test_order', n->'is_test_order',
          'payment_method', n->'payment_method',
          'is_deleted', n->'is_deleted'
        ),
        'old', jsonb_build_object(
          'id', o->'id',
          'admin_order_status_v2', o->'admin_order_status_v2',
          'order_manage_status', o->'order_manage_status',
          'deposit_status', o->'deposit_status'
        )
      ),
      'order',
      'ruru-live',
      false
    );
  exception when others then
    null;
  end;
  return null;
end;
$function$
