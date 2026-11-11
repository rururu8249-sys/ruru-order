-- Payment notification only: reads NEW after persistence, inserts site chat, never updates orders.
-- Existing confirmation/points/Bankda triggers are untouched. Existing minute cron is the fallback.
-- Apply as one transaction. No backfill: installation does not post any chat messages.
-- Rollback: drop trigger if exists trg_ruru_live_paid_chat_event on public.orders;
-- Keep the paid-message unique index: it also prevents duplicate cron notices.

create unique index if not exists live_chat_messages_paid_once_idx
  on public.live_chat_messages (broadcast_id, bot_ref)
  where kakao_id = 'bot:ruru' and bot_ref like 'paid:%';

create or replace function public.ruru_live_paid_chat_event()
returns trigger
language plpgsql
security definer
set search_path = ''
set lock_timeout = '100ms'
as $$
declare
  payment_status text;
  nick text;
  group_key text;
  bc record;
  setting_value text;
begin
  -- Internal trigger only; not an RPC for callers to declare a payment.
  if TG_TABLE_SCHEMA <> 'public' or TG_TABLE_NAME <> 'orders' or TG_WHEN <> 'AFTER' then return null; end if;
  payment_status := btrim(coalesce(nullif(NEW.admin_order_status_v2, ''), NEW.order_manage_status, ''));
  if NEW.is_test_order is true or NEW.is_deleted is true
    or NEW.deposit_confirmed_at is null
    or NEW.deposit_confirmed_at < now() - interval '15 minutes'
    or not (position('입금확인' in payment_status) > 0 or payment_status = '카드결제완료') then return null; end if;
  nick := regexp_replace(coalesce(NEW.youtube_nickname, ''), '^\s+|\s+$', '', 'g');
  group_key := btrim(coalesce(NEW.order_group_id, NEW.id::text));
  if nick = '' or group_key = '' then return null; end if;

  select id, started_at into bc from public.broadcasts
    where status = 'ON' and is_deleted <> true order by started_at desc limit 1;
  if not found then return null; end if;
  if NEW.broadcast_id is not null then
    if NEW.broadcast_id <> bc.id then return null; end if;
  elsif NEW.created_at is null or bc.started_at is null or NEW.created_at < bc.started_at then return null;
  end if;

  -- Match the existing JS parsers: only JSON boolean false disables; missing/malformed defaults on.
  for setting_value in select value from public.settings where key in ('live_chat_v1', 'live_chat_bot_v1') loop
    begin
      if setting_value::jsonb -> 'enabled' = 'false'::jsonb then return null; end if;
    exception when invalid_text_representation then null;
    end;
  end loop;
  if char_length(nick) > 10 then nick := left(nick, 9) || '…'; end if;
  insert into public.live_chat_messages(broadcast_id,kakao_id,customer_id,nickname,body,badge,bot_ref)
    values(bc.id,'bot:ruru',null,'루루동이','💗 ' || nick || '님 결제 완료! 감사합니다','bot','paid:' || group_key)
    on conflict do nothing;
  return null;
exception when others then
  -- A failed/locked chat write must not reject payment persistence. Cron can retry later.
  return null;
end;
$$;
revoke all on function public.ruru_live_paid_chat_event() from public, anon, authenticated;

drop trigger if exists trg_ruru_live_paid_chat_event on public.orders;
create trigger trg_ruru_live_paid_chat_event
  after insert or update of admin_order_status_v2, order_manage_status, deposit_confirmed_at on public.orders
  for each row execute function public.ruru_live_paid_chat_event();
