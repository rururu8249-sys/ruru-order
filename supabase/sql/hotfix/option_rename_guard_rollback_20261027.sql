-- 되돌리기: option_rename_guard_20261027.sql 적용 전 함수 원문으로 복원 (백업 표에서 읽음)
begin;
do $do$
declare r record;
begin
  for r in select proname, def from public.ruru_fn_backup_20261027 loop
    execute r.def;
    raise notice '% 원래대로', r.proname;
  end loop;
end;
$do$;
select p.proname, position('[2026-10-27 옵션 이름 바뀜 보호]' in p.prosrc) > 0 as still_applied
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_update_inventory_linked_order_item', 'admin_delete_order_item', 'restore_order_inventory');
commit;
-- ruru_resolve_renamed_option 함수·백업 표는 남겨 둬도 아무 영향 없음(필요하면 drop).
