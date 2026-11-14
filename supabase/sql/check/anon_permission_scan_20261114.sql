-- 손님 경로 권한 점검(읽기만). 새 revoke/새 트리거 뒤 반드시 실행 — total_checked 한 줄만 나오면 정상.
-- A) 색인이 손님(anon)이 실행 못 하는 함수를 쓰는지
select 'index' kind, i.indexrelid::regclass::text obj, p.proname fn
from pg_index i join pg_depend d on d.objid=i.indexrelid and d.classid='pg_class'::regclass and d.refclassid='pg_proc'::regclass
join pg_proc p on p.oid=d.refobjid join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
where not has_function_privilege('anon', p.oid, 'execute')
union all
-- B) 손님이 쓸 수 있는 표의 invoker 트리거가 손님이 실행 못 하는 public 함수를 부르는지
select 'trigger', t.tgrelid::regclass::text||'.'||tf.proname, p.proname
from pg_trigger t join pg_proc tf on tf.oid=t.tgfoid
join pg_proc p on p.pronamespace='public'::regnamespace and p.oid<>tf.oid and tf.prosrc ~ ('[^a-z_]'||p.proname||'[[:space:]]*[(]')
join pg_class c on c.oid=t.tgrelid
where not t.tgisinternal and not tf.prosecdef
  and (has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE'))
  and (not c.relrowsecurity or exists (select 1 from pg_policy pl where pl.polrelid=c.oid))
  and not has_function_privilege('anon', p.oid, 'execute')
union all select 'total_checked', count(*)::text, '' from pg_trigger where not tgisinternal;
