-- 장바구니별 계좌 지정의 수명주기·동시 실행 보강.
-- 1) 가장 먼저 담은 상품을 빼도 같은 장바구니의 지정계좌가 유지된다.
-- 2) 관리자 계좌 변경과 고객 주문 제출이 동시에 실행되면 DB advisory lock 순서대로 하나씩 처리된다.
-- 3) 만료·비움·제출 완료된 장바구니의 지정은 다음 장바구니로 넘어가지 않는다.

alter table public.cart_bank_account_overrides
  add column if not exists cart_expires_at timestamptz;

update public.cart_bank_account_overrides o
   set cart_expires_at = source.max_expires_at
  from (
    select r.session_key, max(r.expires_at) as max_expires_at
      from public.cart_reservations r
     where r.expires_at > now()
     group by r.session_key
  ) source
 where o.cart_expires_at is null
   and o.status = 'active'
   and o.session_key = source.session_key
   and o.cart_started_at <= source.max_expires_at;

-- 현재 살아 있는 장바구니와 연결할 수 없는 예전 active 행은 안전하게 취소한다.
update public.cart_bank_account_overrides
   set status = 'cancelled',
       cancelled_at = coalesce(cancelled_at, now()),
       cart_expires_at = greatest(cart_started_at, coalesce(assigned_at, now()))
 where cart_expires_at is null
   and status = 'active';

update public.cart_bank_account_overrides
   set cart_expires_at = greatest(
     cart_started_at,
     coalesce(consumed_at, cancelled_at, assigned_at, now())
   )
 where cart_expires_at is null;

alter table public.cart_bank_account_overrides
  alter column cart_expires_at set not null;

create index if not exists cart_bank_account_overrides_live_idx
  on public.cart_bank_account_overrides (session_key, cart_expires_at desc)
  where status = 'active';

comment on column public.cart_bank_account_overrides.cart_expires_at is
'이 지정이 속한 장바구니의 서버 만료시각. 동기화로 장바구니가 유지되는 동안 함께 연장되며, 이후 새 장바구니에는 적용되지 않는다.';

create or replace function public.admin_set_cart_bank_override(
  p_session_key text,
  p_account_id text default null,
  p_bank_name text default null,
  p_bank_account text default null,
  p_bank_holder text default null,
  p_assigned_by text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_session_key text := left(trim(coalesce(p_session_key, '')), 80);
  v_now timestamptz := now();
  v_started_at timestamptz;
  v_expires_at timestamptz;
begin
  if length(v_session_key) < 6 then
    raise exception '장바구니 식별값이 올바르지 않습니다.';
  end if;
  if p_account_id is not null and p_account_id not in ('primary', 'secondary') then
    raise exception '선택한 계좌가 올바르지 않습니다.';
  end if;

  -- 주문 제출 wrapper와 같은 잠금키. 먼저 시작한 작업이 끝난 뒤 다음 작업이 현재 상태를 다시 확인한다.
  perform pg_advisory_xact_lock(hashtextextended('cart-bank:' || v_session_key, 0));

  select min(r.created_at), max(r.expires_at)
    into v_started_at, v_expires_at
    from public.cart_reservations r
   where r.session_key = v_session_key
     and r.expires_at > v_now;

  if v_started_at is null or v_expires_at is null then
    raise exception '이미 비었거나 만료된 장바구니입니다. 새로고침해 주세요.';
  end if;

  update public.cart_bank_account_overrides
     set status = 'cancelled', cancelled_at = v_now
   where session_key = v_session_key
     and status = 'active';

  if p_account_id is null then
    return jsonb_build_object('ok', true, 'account', null);
  end if;

  if trim(coalesce(p_bank_name, '')) = ''
     or trim(coalesce(p_bank_holder, '')) = ''
     or regexp_replace(trim(coalesce(p_bank_account, '')), '\s+', '', 'g') !~ '^[0-9-]{6,30}$'
     or length(regexp_replace(coalesce(p_bank_account, ''), '[^0-9]', '', 'g')) < 6 then
    raise exception '선택한 계좌 정보가 올바르지 않습니다.';
  end if;

  insert into public.cart_bank_account_overrides(
    session_key, cart_started_at, cart_expires_at,
    account_id, bank_name, bank_account, bank_holder,
    status, assigned_at, assigned_by,
    consumed_at, consumed_order_group_id, cancelled_at
  ) values (
    v_session_key, v_started_at, v_expires_at,
    p_account_id, trim(p_bank_name), regexp_replace(trim(p_bank_account), '\s+', '', 'g'), trim(p_bank_holder),
    'active', v_now, nullif(left(trim(coalesce(p_assigned_by, '')), 80), ''),
    null, null, null
  )
  on conflict (session_key, cart_started_at) do update
     set cart_expires_at = excluded.cart_expires_at,
         account_id = excluded.account_id,
         bank_name = excluded.bank_name,
         bank_account = excluded.bank_account,
         bank_holder = excluded.bank_holder,
         status = 'active',
         assigned_at = excluded.assigned_at,
         assigned_by = excluded.assigned_by,
         consumed_at = null,
         consumed_order_group_id = null,
         cancelled_at = null;

  return jsonb_build_object(
    'ok', true,
    'account', jsonb_build_object(
      'id', p_account_id,
      'bankName', trim(p_bank_name),
      'bankAccount', regexp_replace(trim(p_bank_account), '\s+', '', 'g'),
      'bankHolder', trim(p_bank_holder)
    ),
    'cartStartedAt', v_started_at,
    'cartExpiresAt', v_expires_at
  );
end;
$function$;

revoke execute on function public.admin_set_cart_bank_override(text, text, text, text, text, text) from public;
revoke execute on function public.admin_set_cart_bank_override(text, text, text, text, text, text) from anon;
revoke execute on function public.admin_set_cart_bank_override(text, text, text, text, text, text) from authenticated;
grant execute on function public.admin_set_cart_bank_override(text, text, text, text, text, text) to service_role;

create or replace function public.submit_customer_order_with_bank_routing(
  p_order_rows jsonb,
  p_point_use_amount integer default 0,
  p_customer_phone text default null,
  p_youtube_nickname text default null,
  p_customer_name text default null,
  p_session_key text default null,
  p_kakao_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_now timestamptz := now();
  v_group_id text;
  v_session_key text := left(trim(coalesce(p_session_key, '')), 80);
  v_cart_started_at timestamptz;
  v_cart_expires_at timestamptz;
  v_override public.cart_bank_account_overrides%rowtype;
  v_result jsonb;
  v_is_duplicate boolean := false;
begin
  v_group_id := nullif(trim(coalesce(p_order_rows->0->>'order_group_id', '')), '');

  if length(v_session_key) >= 6 then
    -- 관리자 지정과 제출을 직렬화한다. 잠금 뒤 현재 장바구니를 다시 읽는다.
    perform pg_advisory_xact_lock(hashtextextended('cart-bank:' || v_session_key, 0));

    select min(r.created_at), max(r.expires_at)
      into v_cart_started_at, v_cart_expires_at
      from public.cart_reservations r
     where r.session_key = v_session_key
       and r.expires_at > v_now;

    if v_cart_started_at is not null then
      select o.* into v_override
        from public.cart_bank_account_overrides o
       where o.session_key = v_session_key
         and o.status = 'active'
         and o.cart_started_at <= v_cart_started_at
         and o.cart_expires_at > v_now
       order by o.assigned_at desc, o.id desc
       limit 1
       for update;

      if v_override.id is not null and v_cart_expires_at > v_override.cart_expires_at then
        update public.cart_bank_account_overrides
           set cart_expires_at = v_cart_expires_at
         where id = v_override.id;
        v_override.cart_expires_at := v_cart_expires_at;
      end if;
    end if;
  end if;

  v_result := public.submit_customer_order_with_bank_routing_base_v1(
    p_order_rows,
    p_point_use_amount,
    p_customer_phone,
    p_youtube_nickname,
    p_customer_name,
    p_session_key,
    p_kakao_id
  );

  begin
    v_is_duplicate := coalesce((v_result->>'duplicate')::boolean, false);
  exception when others then
    v_is_duplicate := false;
  end;

  if v_override.id is not null and not v_is_duplicate and v_group_id is not null then
    update public.orders
       set payment_bank_account_id = v_override.account_id,
           payment_bank_name = v_override.bank_name,
           payment_bank_account = v_override.bank_account,
           payment_bank_holder = v_override.bank_holder,
           payment_bank_assigned_at = v_now,
           payment_bank_assignment_source = 'cart_override'
     where order_group_id = v_group_id;

    if not found then
      raise exception '장바구니 지정계좌를 적용할 주문을 찾지 못했습니다.';
    end if;

    update public.cart_bank_account_overrides
       set status = 'consumed',
           consumed_at = v_now,
           consumed_order_group_id = v_group_id
     where id = v_override.id
       and status = 'active';

    if not found then
      raise exception '장바구니 지정계좌가 이미 사용되었거나 취소되었습니다.';
    end if;

    v_result := coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
      'bank_account', jsonb_build_object(
        'id', v_override.account_id,
        'bankName', v_override.bank_name,
        'bankAccount', v_override.bank_account,
        'bankHolder', v_override.bank_holder
      ),
      'bank_assignment_source', 'cart_override'
    );
  end if;

  return v_result;
end;
$function$;

revoke execute on function public.submit_customer_order_with_bank_routing(jsonb, integer, text, text, text, text, text) from public;
revoke execute on function public.submit_customer_order_with_bank_routing(jsonb, integer, text, text, text, text, text) from anon;
revoke execute on function public.submit_customer_order_with_bank_routing(jsonb, integer, text, text, text, text, text) from authenticated;
grant execute on function public.submit_customer_order_with_bank_routing(jsonb, integer, text, text, text, text, text) to service_role;

-- 화면의 회원 여부도 실제 계좌 라우팅과 동일하게 카카오 ID 우선, 카카오 ID가 없을 때만 전화번호를 사용한다.
create or replace function public.admin_cart_customer_order_meta(p_identities jsonb)
returns table (
  session_key text,
  is_registered boolean,
  valid_order_count bigint,
  last_order_at timestamptz
)
language sql
security invoker
set search_path = public, pg_temp
as $function$
  with identity_rows as (
    select
      left(trim(coalesce(item->>'sessionKey', '')), 80) as session_key,
      regexp_replace(coalesce(item->>'phone', ''), '[^0-9]', '', 'g') as phone,
      trim(coalesce(item->>'kakaoId', '')) as kakao_id
    from jsonb_array_elements(coalesce(p_identities, '[]'::jsonb)) item
    where trim(coalesce(item->>'sessionKey', '')) <> ''
  )
  select
    i.session_key,
    exists (
      select 1 from public.customers c
      where (i.kakao_id <> '' and trim(coalesce(c.kakao_id, '')) = i.kakao_id)
         or (i.kakao_id = '' and i.phone <> '' and regexp_replace(coalesce(c.customer_phone, ''), '[^0-9]', '', 'g') = i.phone)
    ) as is_registered,
    coalesce(stats.valid_order_count, 0)::bigint as valid_order_count,
    stats.last_order_at
  from identity_rows i
  left join lateral (
    select count(distinct coalesce(nullif(trim(o.order_group_id), ''), o.id::text))::bigint as valid_order_count,
           max(o.created_at) as last_order_at
    from public.orders o
    where o.is_deleted is distinct from true
      and o.is_test_order is distinct from true
      and lower(concat_ws(' ', o.order_manage_status, o.order_status, o.admin_status, o.admin_order_status_v2)) !~ '취소|환불|cancel|refund'
      and (
        (i.kakao_id <> '' and (
          trim(coalesce(o.kakao_id, '')) = i.kakao_id
          or (trim(coalesce(o.kakao_id, '')) = '' and i.phone <> '' and regexp_replace(coalesce(o.customer_phone, o.phone, ''), '[^0-9]', '', 'g') = i.phone)
        ))
        or (i.kakao_id = '' and i.phone <> '' and regexp_replace(coalesce(o.customer_phone, o.phone, ''), '[^0-9]', '', 'g') = i.phone)
      )
  ) stats on true;
$function$;

revoke execute on function public.admin_cart_customer_order_meta(jsonb) from public;
revoke execute on function public.admin_cart_customer_order_meta(jsonb) from anon;
revoke execute on function public.admin_cart_customer_order_meta(jsonb) from authenticated;
grant execute on function public.admin_cart_customer_order_meta(jsonb) to service_role;
