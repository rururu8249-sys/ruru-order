-- 계좌 라우팅 배포 후 비파괴 검증
-- Supabase SQL Editor 또는 psql에서 실행한다. 실패하면 예외로 중단한다.

do $verify$
declare
  v_signature regprocedure := to_regprocedure(
    'public.submit_customer_order_with_bank_routing(jsonb,integer,text,text,text,text,text)'
  );
  v_admin_signature regprocedure := to_regprocedure(
    'public.admin_set_cart_bank_override(text,text,text,text,text,text)'
  );
  v_missing_columns text[];
  v_security_definer boolean;
  v_config text[];
begin
  select array_agg(required.name order by required.name)
    into v_missing_columns
  from (
    values
      ('customer_order_segment'),
      ('payment_bank_account_id'),
      ('payment_bank_name'),
      ('payment_bank_account'),
      ('payment_bank_holder'),
      ('payment_bank_assigned_at'),
      ('payment_bank_assignment_source')
  ) as required(name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'orders'
      and c.column_name = required.name
  );

  if cardinality(v_missing_columns) > 0 then
    raise exception 'orders 계좌 스냅샷 컬럼 누락: %', v_missing_columns;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_customer_order_segment_check'
  ) then
    raise exception 'orders_customer_order_segment_check 제약조건이 없습니다.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_payment_bank_account_id_check'
  ) then
    raise exception 'orders_payment_bank_account_id_check 제약조건이 없습니다.';
  end if;

  if v_signature is null then
    raise exception 'submit_customer_order_with_bank_routing 함수가 없습니다.';
  end if;

  if v_admin_signature is null then
    raise exception 'admin_set_cart_bank_override 함수가 없습니다.';
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'cart_bank_account_overrides'
      and c.column_name = 'cart_expires_at'
      and c.is_nullable = 'NO'
  ) then
    raise exception 'cart_bank_account_overrides.cart_expires_at NOT NULL 컬럼이 없습니다.';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'cart_bank_account_overrides'
      and c.relrowsecurity
  ) then
    raise exception 'cart_bank_account_overrides RLS가 활성화되어 있지 않습니다.';
  end if;

  select p.prosecdef, p.proconfig
    into v_security_definer, v_config
  from pg_proc p
  where p.oid = v_signature;

  if v_security_definer then
    raise exception '계좌 라우팅 함수는 SECURITY INVOKER여야 합니다.';
  end if;
  if not ('search_path=public, pg_temp' = any(coalesce(v_config, array[]::text[]))) then
    raise exception '계좌 라우팅 함수 search_path가 고정되어 있지 않습니다.';
  end if;

  if exists (
       select 1
       from pg_proc p,
            lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
       where p.oid = v_signature
         and privilege.grantee = 0
         and privilege.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', v_signature, 'EXECUTE')
     or has_function_privilege('authenticated', v_signature, 'EXECUTE') then
    raise exception 'PUBLIC/anon/authenticated에 계좌 라우팅 함수 실행 권한이 남아 있습니다.';
  end if;
  if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
    raise exception 'service_role에 계좌 라우팅 함수 실행 권한이 없습니다.';
  end if;

  if has_function_privilege('anon', v_admin_signature, 'EXECUTE')
     or has_function_privilege('authenticated', v_admin_signature, 'EXECUTE') then
    raise exception 'anon/authenticated에 장바구니 계좌 지정 함수 실행 권한이 남아 있습니다.';
  end if;
  if not has_function_privilege('service_role', v_admin_signature, 'EXECUTE') then
    raise exception 'service_role에 장바구니 계좌 지정 함수 실행 권한이 없습니다.';
  end if;

  raise notice 'PASS: 계좌 라우팅 컬럼·제약조건·함수·권한 검증 완료';
end
$verify$;

select
  'PASS' as result,
  '동작 fixture는 scripts/test-bank-account-routing-sql.mjs에서 실제 PostgreSQL(PGlite) 트랜잭션으로 검증합니다.' as detail;
