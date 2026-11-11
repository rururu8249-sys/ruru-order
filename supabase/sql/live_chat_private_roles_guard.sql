-- Only protect the role fields used to authorize private deleted-chat history.
-- Existing anonymous display-setting upserts may keep working with unchanged roles.
-- No customer/order/payment data or existing setting values are changed.
begin;
create or replace function public.guard_live_chat_private_roles()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public
as $function$
declare
  old_value jsonb;
  new_value jsonb;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'DELETE' then
    if old.key = 'live_watch_v1' then
      raise exception 'Chat role settings require an authenticated administrator' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.key <> 'live_watch_v1' and new.key <> 'live_watch_v1' then return new; end if;
    if old.key is distinct from new.key then
      raise exception 'Chat role setting key cannot be changed' using errcode = '42501';
    end if;
    old_value := coalesce(nullif(old.value, '')::jsonb, '{}'::jsonb);
  else
    if new.key <> 'live_watch_v1' then return new; end if;
    select coalesce(nullif(s.value, '')::jsonb, '{}'::jsonb) into old_value
      from public.settings s where s.key = 'live_watch_v1';
  end if;
  new_value := coalesce(nullif(new.value, '')::jsonb, '{}'::jsonb);
  if coalesce(old_value->'owners', '[]'::jsonb) is distinct from coalesce(new_value->'owners', '[]'::jsonb)
     or coalesce(old_value->'mods', '[]'::jsonb) is distinct from coalesce(new_value->'mods', '[]'::jsonb) then
    raise exception 'Chat role settings require an authenticated administrator' using errcode = '42501';
  end if;
  return new;
end;
$function$;
drop trigger if exists guard_live_chat_private_roles on public.settings;
create trigger guard_live_chat_private_roles before insert or update or delete on public.settings
for each row execute function public.guard_live_chat_private_roles();

-- Isolated checks: only a temporary copy is modified; no live setting/event changes.
create temporary table chat_role_guard_check (key text primary key, value text) on commit drop;
insert into chat_role_guard_check select key, value from public.settings where key = 'live_watch_v1';
grant select, insert, update, delete on chat_role_guard_check to anon, authenticated;
create trigger chat_role_guard_check before insert or update or delete on chat_role_guard_check
for each row execute function public.guard_live_chat_private_roles();
set local role anon;
do $test$
declare blocked boolean;
begin
  -- Unchanged role fields allow normal display changes.
  update chat_role_guard_check set value = (value::jsonb || '{"firstView":"live"}'::jsonb)::text;
  insert into chat_role_guard_check select key, value from public.settings where key = 'live_watch_v1'
    on conflict (key) do update set value = excluded.value;
  blocked := false;
  begin
    update chat_role_guard_check set value = (value::jsonb || '{"mods":["01000000000"]}'::jsonb)::text;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Role update was not blocked'; end if;
  blocked := false;
  begin
    update chat_role_guard_check set value = (value::jsonb || '{"owners":[{"phone":"01000000000","badge":"crown"}]}'::jsonb)::text;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Owner update was not blocked'; end if;
  blocked := false;
  begin
    insert into chat_role_guard_check values ('live_watch_v1', '{"owners":[{"phone":"01000000000","badge":"crown"}]}');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Role insert was not blocked'; end if;
  blocked := false;
  begin
    update chat_role_guard_check set key = 'unprotected';
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Key rename was not blocked'; end if;
  blocked := false;
  begin
    delete from chat_role_guard_check;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Role deletion was not blocked'; end if;
  insert into chat_role_guard_check values ('unrelated_test_setting', '{}');
  update chat_role_guard_check set value = '{"test":true}' where key = 'unrelated_test_setting';
  blocked := false;
  begin
    update chat_role_guard_check set key = 'live_watch_v1' where key = 'unrelated_test_setting';
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Inward key rename was not blocked'; end if;
  delete from chat_role_guard_check where key = 'unrelated_test_setting';
end;
$test$;
reset role;
set local role authenticated;
do $test$
declare blocked boolean := false;
begin
  begin
    update chat_role_guard_check set value = (value::jsonb || '{"mods":["01000000000"]}'::jsonb)::text;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Authenticated role escalation was not blocked'; end if;
end;
$test$;
reset role;
commit;
