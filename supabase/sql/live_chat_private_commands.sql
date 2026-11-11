-- Slash commands are private audit rows, including writes from older deployments.
-- Existing RLS denies direct client reads; the public event trigger redacts hidden bodies.
begin;
create or replace function public.ruru_private_chat_command()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if (TG_OP = 'UPDATE' and OLD.hidden_by = 'command')
     or (NEW.badge is distinct from 'bot' and left(ltrim(NEW.body), 1) = '/') then
    NEW.hidden_at := coalesce(NEW.hidden_at, now());
    NEW.hidden_by := 'command';
    NEW.pinned_at := null;
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_ruru_private_chat_command on public.live_chat_messages;
create trigger trg_ruru_private_chat_command before insert or update
on public.live_chat_messages for each row execute function public.ruru_private_chat_command();

-- Retain originals for the verified author; existing realtime emits only redacted removal.
update public.live_chat_messages
set hidden_at = coalesce(hidden_at, now()), hidden_by = 'command', pinned_at = null
where badge is distinct from 'bot' and left(ltrim(body), 1) = '/'
  and (hidden_by is distinct from 'command' or hidden_at is null or pinned_at is not null);
commit;
