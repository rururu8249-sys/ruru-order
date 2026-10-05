-- Read-only live function/schema snapshot, 2026-10-05. Isolated test fixture only; NOT a migration.
create table public.cart_bank_account_overrides (
id bigint not null,
session_key text not null,
cart_started_at timestamp with time zone not null,
account_id text not null,
bank_name text not null,
bank_account text not null,
bank_holder text not null,
status text,
assigned_at timestamp with time zone,
assigned_by text,
consumed_at timestamp with time zone,
consumed_order_group_id text,
cancelled_at timestamp with time zone,
cart_expires_at timestamp with time zone not null
);

create table public.settings (
id bigint not null,
key text not null,
value text not null,
updated_at timestamp with time zone
);
CREATE OR REPLACE FUNCTION public.submit_customer_order_with_bank_routing(p_order_rows jsonb, p_point_use_amount integer DEFAULT 0, p_customer_phone text DEFAULT NULL::text, p_youtube_nickname text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_session_key text DEFAULT NULL::text, p_kakao_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.submit_customer_order_with_bank_routing_base_v1(p_order_rows jsonb, p_point_use_amount integer DEFAULT 0, p_customer_phone text DEFAULT NULL::text, p_youtube_nickname text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_session_key text DEFAULT NULL::text, p_kakao_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_group_id text;
  v_broadcast_id uuid;
  v_phone text;
  v_kakao_id text;
  v_identity_key text;
  v_now timestamptz := now();
  v_duplicate public.orders%rowtype;
  v_duplicate_count integer := 0;
  v_snapshot_count integer := 0;
  v_same_broadcast_count integer := 0;
  v_same_broadcast public.orders%rowtype;
  v_prior_exists boolean := false;
  v_first_valid_order_at timestamptz;
  v_segment text;
  v_config_text text;
  v_config jsonb;
  v_mode text;
  v_window_enabled boolean := false;
  v_window_start_date date;
  v_window_end_date date;
  v_current_kst_date date;
  v_first_order_kst_date date;
  v_selected_account_id text;
  v_selected_account jsonb;
  v_bank_name text;
  v_bank_account text;
  v_bank_holder text;
  v_rows_with_snapshot jsonb;
  v_result jsonb;
  v_use_saved_snapshot boolean := false;
begin
  if p_order_rows is null or jsonb_typeof(p_order_rows) <> 'array' or jsonb_array_length(p_order_rows) < 1 then
    raise exception '주문 상품이 없습니다.';
  end if;

  v_group_id := nullif(trim(p_order_rows->0->>'order_group_id'), '');
  if v_group_id is null then
    raise exception '주문 그룹 식별값이 없습니다.';
  end if;

  begin
    v_broadcast_id := nullif(trim(p_order_rows->0->>'broadcast_id'), '')::uuid;
  exception when invalid_text_representation then
    raise exception '방송 식별값이 올바르지 않습니다.';
  end;

  v_phone := regexp_replace(coalesce(p_customer_phone, p_order_rows->0->>'customer_phone', p_order_rows->0->>'phone', ''), '[^0-9]', '', 'g');
  if length(v_phone) < 9 then
    raise exception '전화번호가 올바르지 않습니다.';
  end if;

  v_kakao_id := trim(coalesce(p_kakao_id, ''));
  if v_kakao_id <> '' and v_kakao_id !~ '^[0-9]+$' then
    raise exception '카카오 고객 식별값이 올바르지 않습니다.';
  end if;

  v_identity_key := case when v_kakao_id <> '' then 'kakao:' || v_kakao_id else 'phone:' || v_phone end;
  perform pg_advisory_xact_lock(hashtextextended('bank-route:' || v_identity_key, 0));

  select count(*)::integer,
         count(distinct concat_ws('|',
           coalesce(o.customer_order_segment, ''),
           coalesce(o.payment_bank_account_id, ''),
           coalesce(o.payment_bank_name, ''),
           coalesce(o.payment_bank_account, ''),
           coalesce(o.payment_bank_holder, '')
         ))::integer
    into v_duplicate_count, v_snapshot_count
  from public.orders o
  where o.order_group_id = v_group_id;

  if v_duplicate_count > 0 then
    select o.* into v_duplicate
    from public.orders o
    where o.order_group_id = v_group_id
    order by o.id
    limit 1;

    if v_kakao_id <> '' and coalesce(trim(v_duplicate.kakao_id), '') <> '' then
      if trim(v_duplicate.kakao_id) <> v_kakao_id then
        raise exception '기존 주문과 고객 식별값이 일치하지 않습니다.';
      end if;
    elsif regexp_replace(coalesce(v_duplicate.customer_phone, v_duplicate.phone, ''), '[^0-9]', '', 'g') <> v_phone then
      raise exception '기존 주문과 고객 전화번호가 일치하지 않습니다.';
    end if;

    if v_snapshot_count > 1 then
      raise exception '같은 주문 그룹의 입금계좌 정보가 서로 달라 확인이 필요합니다.';
    end if;

    if v_duplicate.customer_order_segment is not null
       and v_duplicate.payment_bank_account_id is not null
       and v_duplicate.payment_bank_name is not null
       and v_duplicate.payment_bank_account is not null
       and v_duplicate.payment_bank_holder is not null then
      v_segment := v_duplicate.customer_order_segment;
      v_selected_account_id := v_duplicate.payment_bank_account_id;
      v_bank_name := v_duplicate.payment_bank_name;
      v_bank_account := v_duplicate.payment_bank_account;
      v_bank_holder := v_duplicate.payment_bank_holder;
      v_use_saved_snapshot := true;
    end if;
  end if;

  -- 같은 방송의 추가 주문은 날짜가 바뀌어도 그 방송에서 처음 안내한 계좌를 그대로 쓴다.
  if not v_use_saved_snapshot and v_broadcast_id is not null then
    select count(distinct concat_ws('|',
             coalesce(o.customer_order_segment, ''),
             coalesce(o.payment_bank_account_id, ''),
             coalesce(o.payment_bank_name, ''),
             coalesce(o.payment_bank_account, ''),
             coalesce(o.payment_bank_holder, '')
           ))::integer
      into v_snapshot_count
    from public.orders o
    where o.order_group_id <> v_group_id
      and o.broadcast_id = v_broadcast_id
      and o.is_deleted is distinct from true
      and o.is_test_order is distinct from true
      and lower(concat_ws(' ', o.order_manage_status, o.order_status, o.admin_status, o.admin_order_status_v2)) !~ '취소|환불|cancel|refund'
      and (
        (v_kakao_id <> '' and (
          trim(coalesce(o.kakao_id, '')) = v_kakao_id
          or (trim(coalesce(o.kakao_id, '')) = '' and regexp_replace(coalesce(o.customer_phone, o.phone, ''), '[^0-9]', '', 'g') = v_phone)
        ))
        or (v_kakao_id = '' and regexp_replace(coalesce(o.customer_phone, o.phone, ''), '[^0-9]', '', 'g') = v_phone)
      )
      and coalesce(o.payment_bank_assignment_source, '') <> 'cart_override'
      and o.customer_order_segment is not null
      and o.payment_bank_account_id is not null
      and o.payment_bank_name is not null
      and o.payment_bank_account is not null
      and o.payment_bank_holder is not null;

    if v_snapshot_count > 1 then
      raise exception '같은 방송의 이전 주문 계좌가 서로 달라 확인이 필요합니다.';
    end if;

    if v_snapshot_count = 1 then
      select o.* into v_same_broadcast
      from public.orders o
      where o.order_group_id <> v_group_id
        and o.broadcast_id = v_broadcast_id
        and o.is_deleted is distinct from true
        and o.is_test_order is distinct from true
        and lower(concat_ws(' ', o.order_manage_status, o.order_status, o.admin_status, o.admin_order_status_v2)) !~ '취소|환불|cancel|refund'
        and (
          (v_kakao_id <> '' and (
            trim(coalesce(o.kakao_id, '')) = v_kakao_id
            or (trim(coalesce(o.kakao_id, '')) = '' and regexp_replace(coalesce(o.customer_phone, o.phone, ''), '[^0-9]', '', 'g') = v_phone)
          ))
          or (v_kakao_id = '' and regexp_replace(coalesce(o.customer_phone, o.phone, ''), '[^0-9]', '', 'g') = v_phone)
        )
        and coalesce(o.payment_bank_assignment_source, '') <> 'cart_override'
        and o.customer_order_segment is not null
        and o.payment_bank_account_id is not null
        and o.payment_bank_name is not null
        and o.payment_bank_account is not null
        and o.payment_bank_holder is not null
      order by o.created_at, o.id
      limit 1;

      v_segment := v_same_broadcast.customer_order_segment;
      v_selected_account_id := v_same_broadcast.payment_bank_account_id;
      v_bank_name := v_same_broadcast.payment_bank_name;
      v_bank_account := v_same_broadcast.payment_bank_account;
      v_bank_holder := v_same_broadcast.payment_bank_holder;
      v_use_saved_snapshot := true;
    end if;
  end if;

  if not v_use_saved_snapshot then
    select count(*) > 0, min(o.created_at)
      into v_prior_exists, v_first_valid_order_at
    from public.orders o
    where o.order_group_id <> v_group_id
      and o.is_deleted is distinct from true
      and o.is_test_order is distinct from true
      and lower(concat_ws(' ', o.order_manage_status, o.order_status, o.admin_status, o.admin_order_status_v2)) !~ '취소|환불|cancel|refund'
      and (
        (v_kakao_id <> '' and (
          trim(coalesce(o.kakao_id, '')) = v_kakao_id
          or (trim(coalesce(o.kakao_id, '')) = '' and regexp_replace(coalesce(o.customer_phone, o.phone, ''), '[^0-9]', '', 'g') = v_phone)
        ))
        or (v_kakao_id = '' and regexp_replace(coalesce(o.customer_phone, o.phone, ''), '[^0-9]', '', 'g') = v_phone)
      );

    select s.value into v_config_text
    from public.settings s
    where s.key = 'shop_bank_config_v1'
    limit 1;

    if nullif(trim(coalesce(v_config_text, '')), '') is null then
      select jsonb_build_object(
        'version', 1,
        'accounts', jsonb_build_array(jsonb_build_object(
          'id', 'primary',
          'enabled', true,
          'label', '기존 계좌',
        'bankName', coalesce(max(s.value) filter (where s.key = 'shop_bank_name'), '새마을금고'),
        'bankAccount', coalesce(max(s.value) filter (where s.key = 'shop_bank_account'), '9002186993725'),
        'bankHolder', coalesce(max(s.value) filter (where s.key = 'shop_bank_holder'), '유혜원')
        )),
        'routing', jsonb_build_object(
          'mode', 'all',
          'allAccountId', 'primary',
          'existingAccountId', 'primary',
          'firstOrderAccountId', 'primary',
          'firstOrderWindow', jsonb_build_object(
            'enabled', false,
            'startDate', '',
            'endDate', ''
          )
        )
      ) into v_config
      from public.settings s
      where s.key in ('shop_bank_name', 'shop_bank_account', 'shop_bank_holder');
    else
      begin
        v_config := v_config_text::jsonb;
      exception when others then
        raise exception '입금계좌 설정 JSON이 올바르지 않습니다.';
      end;
    end if;

    if v_config is null
       or coalesce((v_config->>'version')::integer, 0) <> 1
       or jsonb_typeof(v_config->'accounts') <> 'array'
       or jsonb_array_length(v_config->'accounts') < 1
       or jsonb_array_length(v_config->'accounts') > 2
       or jsonb_typeof(v_config->'routing') <> 'object' then
      raise exception '입금계좌 설정이 없거나 올바르지 않습니다.';
    end if;

    v_mode := v_config->'routing'->>'mode';
    v_segment := case when v_prior_exists then 'existing' else 'first_order' end;
    v_window_enabled := coalesce((v_config->'routing'->'firstOrderWindow'->>'enabled')::boolean, false);

    if v_mode = 'split' and v_window_enabled then
      begin
        v_window_start_date := (v_config->'routing'->'firstOrderWindow'->>'startDate')::date;
        v_window_end_date := (v_config->'routing'->'firstOrderWindow'->>'endDate')::date;
      exception when others then
        raise exception '신규회원 계좌 유지기간 날짜가 올바르지 않습니다.';
      end;

      if v_window_start_date is null or v_window_end_date is null or v_window_start_date > v_window_end_date then
        raise exception '신규회원 계좌 유지기간 설정이 올바르지 않습니다.';
      end if;

      v_current_kst_date := (v_now at time zone 'Asia/Seoul')::date;
      v_first_order_kst_date := (coalesce(v_first_valid_order_at, v_now) at time zone 'Asia/Seoul')::date;
      if v_current_kst_date between v_window_start_date and v_window_end_date
         and v_first_order_kst_date between v_window_start_date and v_window_end_date then
        v_segment := 'first_order';
      end if;
    end if;

    if v_mode = 'all' then
      v_selected_account_id := v_config->'routing'->>'allAccountId';
    elsif v_mode = 'split' then
      v_selected_account_id := case
        when v_segment = 'first_order' then v_config->'routing'->>'firstOrderAccountId'
        else v_config->'routing'->>'existingAccountId'
      end;
    else
      raise exception '입금계좌 노출 방식이 올바르지 않습니다.';
    end if;

    if v_selected_account_id not in ('primary', 'secondary') then
      raise exception '선택된 입금계좌 구분이 올바르지 않습니다.';
    end if;

    select account into v_selected_account
    from jsonb_array_elements(v_config->'accounts') as source(account)
    where account->>'id' = v_selected_account_id
      and coalesce((account->>'enabled')::boolean, false) is true
    limit 1;

    if v_selected_account is null then
      raise exception '선택된 입금계좌가 없거나 비활성 상태입니다.';
    end if;

    v_bank_name := trim(coalesce(v_selected_account->>'bankName', ''));
    v_bank_account := regexp_replace(trim(coalesce(v_selected_account->>'bankAccount', '')), '\s+', '', 'g');
    v_bank_holder := trim(coalesce(v_selected_account->>'bankHolder', ''));

    if v_bank_name = ''
       or v_bank_holder = ''
       or v_bank_account !~ '^[0-9-]{6,30}$'
       or length(regexp_replace(v_bank_account, '[^0-9]', '', 'g')) < 6 then
      raise exception '선택된 입금계좌 정보가 올바르지 않습니다.';
    end if;
  end if;

  select jsonb_agg(
    row_value || jsonb_build_object(
      'kakao_id', nullif(v_kakao_id, ''),
      'customer_order_segment', v_segment,
      'payment_bank_account_id', v_selected_account_id,
      'payment_bank_name', v_bank_name,
      'payment_bank_account', v_bank_account,
      'payment_bank_holder', v_bank_holder,
      'payment_bank_assigned_at', v_now
    ) order by ordinality
  ) into v_rows_with_snapshot
  from jsonb_array_elements(p_order_rows) with ordinality as source(row_value, ordinality);

  v_result := public.submit_customer_order_with_points(
    v_rows_with_snapshot,
    p_point_use_amount,
    p_customer_phone,
    p_youtube_nickname,
    p_customer_name,
    p_session_key
  );

  if not v_use_saved_snapshot then
    update public.orders
       set customer_order_segment = v_segment,
           payment_bank_account_id = v_selected_account_id,
           payment_bank_name = v_bank_name,
           payment_bank_account = v_bank_account,
           payment_bank_holder = v_bank_holder,
           payment_bank_assigned_at = coalesce(payment_bank_assigned_at, v_now),
           kakao_id = case when v_kakao_id <> '' then v_kakao_id else kakao_id end
     where order_group_id = v_group_id;
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'customer_order_segment', v_segment,
    'bank_account', jsonb_build_object(
      'id', v_selected_account_id,
      'bankName', v_bank_name,
      'bankAccount', v_bank_account,
      'bankHolder', v_bank_holder
    )
  );
end;
$function$
;

