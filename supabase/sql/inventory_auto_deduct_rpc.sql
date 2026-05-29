-- supabase/sql/inventory_auto_deduct_rpc.sql
-- 목적:
-- - 등록상품 주문 제출 시 재고 자동 차감
-- - 직접입력 상품(product_id 없음)은 차감 제외
-- - 재고관리 OFF 상품은 차감 제외
-- - 재고 부족 시 주문 저장 전 차단
-- - 주문 저장 + 포인트 차감 + 재고 차감 + 재고 이력 저장을 RPC 한 번의 트랜잭션으로 처리
--
-- 적용 방법:
-- 1) 이 파일 내용을 Supabase SQL Editor에 붙여넣고 실행
-- 2) 실행 전 반드시 최신 배포/백업 상태 확인
--
-- 주의:
-- - 이 파일을 Git에 커밋하는 것만으로는 Supabase DB에 적용되지 않음
-- - 실제 적용은 Supabase SQL Editor에서 별도 실행 필요

begin;

create extension if not exists pgcrypto;

create or replace function public.ruru_try_parse_jsonb(p_text text)
returns jsonb
language plpgsql
immutable
as $$
begin
  if p_text is null or trim(p_text) = '' then
    return '{}'::jsonb;
  end if;

  return p_text::jsonb;
exception
  when others then
    return '{}'::jsonb;
end;
$$;

alter table public.products
  add column if not exists stock integer not null default 0;

alter table public.products
  add column if not exists is_soldout boolean not null default false;

alter table public.products
  add column if not exists product_note text;

alter table public.orders
  add column if not exists product_id bigint;

alter table public.orders
  add column if not exists inventory_deducted_at timestamptz;

alter table public.orders
  add column if not exists inventory_ledger_id uuid;

alter table public.orders
  add column if not exists inventory_deduction_status text;

alter table public.orders
  add column if not exists inventory_deduction_memo text;

create table if not exists public.product_inventory_variants (
  id bigserial primary key,
  product_id bigint not null,
  color text not null default '',
  size text not null default '',
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_inventory_variants_unique unique (product_id, color, size)
);

create table if not exists public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null,
  color text,
  size text,
  change_qty integer not null,
  reason text not null,
  order_id bigint,
  order_group_id text,
  before_stock integer,
  after_stock integer,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists product_inventory_variants_product_idx
  on public.product_inventory_variants (product_id);

create index if not exists inventory_ledger_product_created_idx
  on public.inventory_ledger (product_id, created_at desc);

create index if not exists inventory_ledger_order_idx
  on public.inventory_ledger (order_id)
  where order_id is not null;

create index if not exists orders_product_id_idx
  on public.orders (product_id)
  where product_id is not null;

create index if not exists orders_inventory_ledger_id_idx
  on public.orders (inventory_ledger_id)
  where inventory_ledger_id is not null;

insert into public.product_inventory_variants (
  product_id,
  color,
  size,
  stock
)
select
  p.id::bigint as product_id,
  trim(coalesce(variant_row.value->>'color', '')) as color,
  trim(coalesce(variant_row.value->>'size', '')) as size,
  greatest(
    0,
    case
      when coalesce(variant_row.value->>'stock', '') ~ '^[0-9]+$'
        then (variant_row.value->>'stock')::integer
      else 0
    end
  ) as stock
from public.products p
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(public.ruru_try_parse_jsonb(p.product_note)->'stock_variants') = 'array'
      then public.ruru_try_parse_jsonb(p.product_note)->'stock_variants'
    else '[]'::jsonb
  end
) as variant_row(value)
where p.id is not null
on conflict (product_id, color, size) do nothing;

create or replace function public.submit_customer_order_with_points(
  p_order_rows jsonb,
  p_point_use_amount integer default 0,
  p_customer_phone text default null,
  p_youtube_nickname text default null,
  p_customer_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_youtube_nickname text;
  v_customer_name text;
  v_order_count integer;
  v_now timestamptz := now();

  v_current_points integer := 0;
  v_point_use_request integer := 0;
  v_payable_before_points integer := 0;
  v_point_used_amount integer := 0;
  v_point_balance_after integer := 0;
  v_point_used_so_far integer := 0;

  v_point_ledger_id uuid := gen_random_uuid();
  v_order_ids bigint[] := array[]::bigint[];
  v_inserted_count integer := 0;

  v_source record;
  v_row_value jsonb;
  v_row_original_amount integer := 0;
  v_row_point_used_amount integer := 0;
  v_row_final_amount integer := 0;

  v_row_product_id bigint;
  v_row_qty integer;
  v_order_id bigint;

  v_product_note_text text;
  v_product_note jsonb;
  v_stock_management_enabled boolean;
  v_stock_mode text;
  v_has_option_variants boolean;

  v_color text;
  v_size text;

  v_before_stock integer;
  v_after_stock integer;
  v_variant_id bigint;
  v_inventory_ledger_id uuid;
  v_inventory_deducted_count integer := 0;
  v_inventory_skipped_count integer := 0;
begin
  if p_order_rows is null or jsonb_typeof(p_order_rows) <> 'array' then
    raise exception '주문 상품이 없습니다.';
  end if;

  v_order_count := jsonb_array_length(p_order_rows);

  if v_order_count <= 0 then
    raise exception '주문 상품이 없습니다.';
  end if;

  v_phone := regexp_replace(
    coalesce(
      p_customer_phone,
      p_order_rows->0->>'customer_phone',
      p_order_rows->0->>'phone',
      ''
    ),
    '[^0-9]',
    '',
    'g'
  );

  if length(v_phone) < 10 then
    raise exception '전화번호가 올바르지 않습니다.';
  end if;

  v_youtube_nickname := left(trim(coalesce(
    p_youtube_nickname,
    p_order_rows->0->>'youtube_nickname',
    ''
  )), 80);

  v_customer_name := left(trim(coalesce(
    p_customer_name,
    p_order_rows->0->>'customer_name',
    ''
  )), 80);

  v_point_use_request := greatest(0, floor(coalesce(p_point_use_amount, 0))::integer);

  select coalesce(current_points, 0)
    into v_current_points
  from public.customer_point_balances
  where customer_phone = v_phone
  for update;

  v_current_points := coalesce(v_current_points, 0);

  for v_source in
    select row_value
    from jsonb_array_elements(p_order_rows) with ordinality as source(row_value, ordinality)
  loop
    v_row_value := v_source.row_value;

    v_row_original_amount := case
      when coalesce(v_row_value->>'final_amount', '') ~ '^[0-9]+$'
        then (v_row_value->>'final_amount')::integer
      when coalesce(v_row_value->>'adjusted_total_price', '') ~ '^[0-9]+$'
        then (v_row_value->>'adjusted_total_price')::integer
      when coalesce(v_row_value->>'total_price', '') ~ '^[0-9]+$'
        then (v_row_value->>'total_price')::integer
      else 0
    end;

    v_payable_before_points := v_payable_before_points + greatest(v_row_original_amount, 0);
  end loop;

  if v_current_points < 1000 or v_point_use_request <= 0 or v_payable_before_points <= 0 then
    v_point_used_amount := 0;
  else
    v_point_used_amount := least(v_current_points, v_point_use_request, v_payable_before_points);
  end if;

  v_point_balance_after := v_current_points - v_point_used_amount;

  for v_source in
    select row_value, ordinality
    from jsonb_array_elements(p_order_rows) with ordinality as source(row_value, ordinality)
    order by ordinality
  loop
    v_row_value := v_source.row_value;

    v_row_original_amount := case
      when coalesce(v_row_value->>'final_amount', '') ~ '^[0-9]+$'
        then (v_row_value->>'final_amount')::integer
      when coalesce(v_row_value->>'adjusted_total_price', '') ~ '^[0-9]+$'
        then (v_row_value->>'adjusted_total_price')::integer
      when coalesce(v_row_value->>'total_price', '') ~ '^[0-9]+$'
        then (v_row_value->>'total_price')::integer
      else 0
    end;

    v_row_original_amount := greatest(v_row_original_amount, 0);
    v_row_point_used_amount := least(v_row_original_amount, greatest(0, v_point_used_amount - v_point_used_so_far));
    v_row_final_amount := greatest(0, v_row_original_amount - v_row_point_used_amount);
    v_point_used_so_far := v_point_used_so_far + v_row_point_used_amount;

    v_row_product_id := null;

    if coalesce(v_row_value->>'product_id', '') ~ '^[0-9]+$' then
      v_row_product_id := (v_row_value->>'product_id')::bigint;
    end if;

    v_row_qty := case
      when coalesce(v_row_value->>'qty', '') ~ '^[0-9]+$'
        then greatest(0, (v_row_value->>'qty')::integer)
      else 0
    end;

    insert into public.orders (
      order_group_id,
      order_lookup_code,
      broadcast_id,
      broadcast_name,
      broadcast_public_title,
      broadcast_admin_subtitle,
      youtube_nickname,
      customer_name,
      customer_phone,
      phone,
      zipcode,
      address,
      detail_address,
      request_memo,
      product_id,
      product_name,
      color,
      size,
      qty,
      product_price,
      shipping_fee,
      total_price,
      adjusted_product_price,
      adjusted_shipping_fee,
      adjusted_total_price,
      payment_method,
      vat_amount,
      customer_card_extra_rate_applied,
      actual_card_fee_rate_applied,
      order_status,
      admin_status,
      order_manage_status,
      shipping_status,
      is_test_order,
      test_order_reason,
      operator_test_phone,
      exclude_from_settlement,
      exclude_from_payment_match,
      exclude_from_shipping,
      exclude_from_picking,
      memo,
      special_note,
      point_original_amount,
      point_used_amount,
      point_balance_before,
      point_balance_after,
      point_used_at,
      final_amount
    )
    values (
      v_row_value->>'order_group_id',
      v_row_value->>'order_lookup_code',
      case
        when coalesce(v_row_value->>'broadcast_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (v_row_value->>'broadcast_id')::uuid
        else null
      end,
      v_row_value->>'broadcast_name',
      v_row_value->>'broadcast_public_title',
      v_row_value->>'broadcast_admin_subtitle',
      coalesce(nullif(v_row_value->>'youtube_nickname', ''), v_youtube_nickname),
      coalesce(nullif(v_row_value->>'customer_name', ''), v_customer_name),
      v_phone,
      v_phone,
      v_row_value->>'zipcode',
      v_row_value->>'address',
      v_row_value->>'detail_address',
      v_row_value->>'request_memo',
      v_row_product_id,
      v_row_value->>'product_name',
      v_row_value->>'color',
      v_row_value->>'size',
      v_row_qty,
      case when coalesce(v_row_value->>'product_price', '') ~ '^[0-9]+$' then (v_row_value->>'product_price')::integer else 0 end,
      case when coalesce(v_row_value->>'shipping_fee', '') ~ '^[0-9]+$' then (v_row_value->>'shipping_fee')::integer else 0 end,
      case when coalesce(v_row_value->>'total_price', '') ~ '^[0-9]+$' then (v_row_value->>'total_price')::integer else 0 end,
      case when coalesce(v_row_value->>'adjusted_product_price', '') ~ '^[0-9]+$' then (v_row_value->>'adjusted_product_price')::integer else 0 end,
      case when coalesce(v_row_value->>'adjusted_shipping_fee', '') ~ '^[0-9]+$' then (v_row_value->>'adjusted_shipping_fee')::integer else 0 end,
      case when coalesce(v_row_value->>'adjusted_total_price', '') ~ '^[0-9]+$' then (v_row_value->>'adjusted_total_price')::integer else 0 end,
      v_row_value->>'payment_method',
      case when coalesce(v_row_value->>'vat_amount', '') ~ '^[0-9]+$' then (v_row_value->>'vat_amount')::integer else 0 end,
      case when coalesce(v_row_value->>'customer_card_extra_rate_applied', '') ~ '^[0-9]+$' then (v_row_value->>'customer_card_extra_rate_applied')::integer else 0 end,
      case when coalesce(v_row_value->>'actual_card_fee_rate_applied', '') ~ '^[0-9]+$' then (v_row_value->>'actual_card_fee_rate_applied')::integer else 0 end,
      coalesce(nullif(v_row_value->>'order_status', ''), '주문완료'),
      coalesce(nullif(v_row_value->>'admin_status', ''), '관리자 확인 전'),
      coalesce(nullif(v_row_value->>'order_manage_status', ''), '주문확인전'),
      coalesce(nullif(v_row_value->>'shipping_status', ''), '합배송중'),
      lower(coalesce(v_row_value->>'is_test_order', 'false')) in ('true', 't', '1', 'yes', 'y'),
      nullif(v_row_value->>'test_order_reason', ''),
      nullif(v_row_value->>'operator_test_phone', ''),
      lower(coalesce(v_row_value->>'exclude_from_settlement', 'false')) in ('true', 't', '1', 'yes', 'y'),
      lower(coalesce(v_row_value->>'exclude_from_payment_match', 'false')) in ('true', 't', '1', 'yes', 'y'),
      lower(coalesce(v_row_value->>'exclude_from_shipping', 'false')) in ('true', 't', '1', 'yes', 'y'),
      lower(coalesce(v_row_value->>'exclude_from_picking', 'false')) in ('true', 't', '1', 'yes', 'y'),
      v_row_value->>'memo',
      v_row_value->>'special_note',
      v_row_original_amount,
      v_row_point_used_amount,
      case when v_point_used_amount > 0 then v_current_points else null end,
      case when v_point_used_amount > 0 then v_point_balance_after else null end,
      case when v_point_used_amount > 0 then v_now else null end,
      v_row_final_amount
    )
    returning id into v_order_id;

    v_order_ids := array_append(v_order_ids, v_order_id);
    v_inserted_count := v_inserted_count + 1;

    if v_row_product_id is null then
      update public.orders
        set inventory_deduction_status = 'skipped_direct_input',
            inventory_deduction_memo = '직접입력 상품 또는 product_id 없음'
      where id = v_order_id;

      v_inventory_skipped_count := v_inventory_skipped_count + 1;
      continue;
    end if;

    if v_row_qty <= 0 then
      update public.orders
        set inventory_deduction_status = 'skipped_invalid_qty',
            inventory_deduction_memo = '수량이 0 이하라 재고 차감 제외'
      where id = v_order_id;

      v_inventory_skipped_count := v_inventory_skipped_count + 1;
      continue;
    end if;

    select
      p.product_note,
      coalesce(p.stock, 0)
      into
      v_product_note_text,
      v_before_stock
    from public.products p
    where p.id = v_row_product_id
    for update;

    if not found then
      raise exception '상품 정보를 찾을 수 없습니다. 상품번호: %', v_row_product_id;
    end if;

    v_product_note := public.ruru_try_parse_jsonb(v_product_note_text);

    v_stock_management_enabled := not (
      lower(coalesce(v_product_note->>'stock_management_enabled', 'true')) in ('false', 'f', '0', 'no', 'n')
    );

    if not v_stock_management_enabled then
      update public.orders
        set inventory_deduction_status = 'skipped_stock_management_off',
            inventory_deduction_memo = '재고관리 OFF 상품'
      where id = v_order_id;

      v_inventory_skipped_count := v_inventory_skipped_count + 1;
      continue;
    end if;

    v_stock_mode := lower(coalesce(nullif(v_product_note->>'stock_mode', ''), 'total'));
    v_has_option_variants := jsonb_typeof(v_product_note->'stock_variants') = 'array'
      and jsonb_array_length(v_product_note->'stock_variants') > 0;

    v_color := trim(coalesce(v_row_value->>'color', ''));
    v_size := trim(coalesce(v_row_value->>'size', ''));

    if v_color in ('없음', '선택안함', '-', 'none', 'NONE', 'None') then
      v_color := '';
    end if;

    if v_size in ('없음', '선택안함', '-', 'none', 'NONE', 'None') then
      v_size := '';
    end if;

    if v_stock_mode = 'option' or v_has_option_variants then
      insert into public.product_inventory_variants (
        product_id,
        color,
        size,
        stock
      )
      select
        v_row_product_id,
        trim(coalesce(variant_row.value->>'color', '')),
        trim(coalesce(variant_row.value->>'size', '')),
        greatest(
          0,
          case
            when coalesce(variant_row.value->>'stock', '') ~ '^[0-9]+$'
              then (variant_row.value->>'stock')::integer
            else 0
          end
        )
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_product_note->'stock_variants') = 'array'
            then v_product_note->'stock_variants'
          else '[]'::jsonb
        end
      ) as variant_row(value)
      on conflict (product_id, color, size) do nothing;

      select id, stock
        into v_variant_id, v_before_stock
      from public.product_inventory_variants
      where product_id = v_row_product_id
        and color = v_color
        and size = v_size
      for update;

      if not found then
        raise exception '선택한 옵션의 재고 정보를 찾을 수 없습니다. 상품명: %, 색상: %, 사이즈: %',
          coalesce(v_row_value->>'product_name', ''),
          coalesce(nullif(v_color, ''), '없음'),
          coalesce(nullif(v_size, ''), '없음');
      end if;

      if v_before_stock < v_row_qty then
        raise exception '재고가 부족합니다. 상품명: %, 색상: %, 사이즈: %, 남은재고: %, 주문수량: %',
          coalesce(v_row_value->>'product_name', ''),
          coalesce(nullif(v_color, ''), '없음'),
          coalesce(nullif(v_size, ''), '없음'),
          v_before_stock,
          v_row_qty;
      end if;

      v_after_stock := v_before_stock - v_row_qty;

      update public.product_inventory_variants
        set stock = v_after_stock,
            updated_at = v_now
      where id = v_variant_id;

      insert into public.inventory_ledger (
        product_id,
        color,
        size,
        change_qty,
        reason,
        order_id,
        order_group_id,
        before_stock,
        after_stock,
        memo
      )
      values (
        v_row_product_id,
        v_color,
        v_size,
        -v_row_qty,
        'customer_order_submit',
        v_order_id,
        v_row_value->>'order_group_id',
        v_before_stock,
        v_after_stock,
        '고객 주문서 제출 자동 재고 차감'
      )
      returning id into v_inventory_ledger_id;

      update public.orders
        set inventory_deducted_at = v_now,
            inventory_ledger_id = v_inventory_ledger_id,
            inventory_deduction_status = 'deducted_option',
            inventory_deduction_memo = '옵션별 재고 자동 차감'
      where id = v_order_id;

      update public.products
        set stock = coalesce((
              select sum(stock)::integer
              from public.product_inventory_variants
              where product_id = v_row_product_id
            ), 0),
            is_soldout = coalesce((
              select sum(stock)::integer
              from public.product_inventory_variants
              where product_id = v_row_product_id
            ), 0) <= 0,
            product_note = jsonb_set(
              v_product_note,
              '{stock_variants}',
              coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'color', color,
                    'size', size,
                    'stock', stock
                  )
                  order by color, size
                )
                from public.product_inventory_variants
                where product_id = v_row_product_id
              ), '[]'::jsonb),
              true
            )::text
      where id = v_row_product_id;

      v_inventory_deducted_count := v_inventory_deducted_count + 1;
    else
      if v_before_stock < v_row_qty then
        raise exception '재고가 부족합니다. 상품명: %, 남은재고: %, 주문수량: %',
          coalesce(v_row_value->>'product_name', ''),
          v_before_stock,
          v_row_qty;
      end if;

      v_after_stock := v_before_stock - v_row_qty;

      update public.products
        set stock = v_after_stock,
            is_soldout = v_after_stock <= 0
      where id = v_row_product_id;

      insert into public.inventory_ledger (
        product_id,
        color,
        size,
        change_qty,
        reason,
        order_id,
        order_group_id,
        before_stock,
        after_stock,
        memo
      )
      values (
        v_row_product_id,
        null,
        null,
        -v_row_qty,
        'customer_order_submit',
        v_order_id,
        v_row_value->>'order_group_id',
        v_before_stock,
        v_after_stock,
        '고객 주문서 제출 총재고 자동 차감'
      )
      returning id into v_inventory_ledger_id;

      update public.orders
        set inventory_deducted_at = v_now,
            inventory_ledger_id = v_inventory_ledger_id,
            inventory_deduction_status = 'deducted_total',
            inventory_deduction_memo = '총재고 자동 차감'
      where id = v_order_id;

      v_inventory_deducted_count := v_inventory_deducted_count + 1;
    end if;
  end loop;

  if v_inserted_count <> v_order_count then
    raise exception '주문 저장 개수가 일치하지 않습니다.';
  end if;

  if v_point_used_amount > 0 then
    insert into public.customer_point_ledger (
      id,
      customer_phone,
      youtube_nickname,
      customer_name,
      change_type,
      amount,
      balance_after,
      reason,
      admin_memo,
      related_order_id,
      related_broadcast_id,
      customer_visible,
      customer_seen_at,
      created_by
    )
    values (
      v_point_ledger_id,
      v_phone,
      nullif(v_youtube_nickname, ''),
      nullif(v_customer_name, ''),
      'adjust',
      -v_point_used_amount,
      v_point_balance_after,
      '주문서 포인트 사용',
      '고객 주문서 포인트 사용 자동 차감',
      coalesce(v_order_ids[1]::text, null),
      null,
      true,
      null,
      'customer-order'
    );

    insert into public.customer_point_balances (
      customer_phone,
      youtube_nickname,
      customer_name,
      current_points,
      total_granted_points,
      total_used_points,
      total_canceled_points,
      total_adjusted_points,
      last_granted_at,
      last_used_at,
      last_customer_seen_at,
      admin_memo
    )
    values (
      v_phone,
      nullif(v_youtube_nickname, ''),
      nullif(v_customer_name, ''),
      v_point_balance_after,
      0,
      v_point_used_amount,
      0,
      0,
      null,
      v_now,
      null,
      '고객 주문서 포인트 사용 자동 차감'
    )
    on conflict (customer_phone) do update
      set
        youtube_nickname = coalesce(excluded.youtube_nickname, public.customer_point_balances.youtube_nickname),
        customer_name = coalesce(excluded.customer_name, public.customer_point_balances.customer_name),
        current_points = v_point_balance_after,
        total_used_points = coalesce(public.customer_point_balances.total_used_points, 0) + v_point_used_amount,
        last_used_at = v_now,
        admin_memo = excluded.admin_memo,
        updated_at = v_now;

    update public.orders
      set point_ledger_id = v_point_ledger_id
    where id = any(v_order_ids);
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted_count', v_inserted_count,
    'order_ids', to_jsonb(v_order_ids),
    'point_original_amount', v_payable_before_points,
    'point_used_amount', v_point_used_amount,
    'point_balance_before', case when v_point_used_amount > 0 then v_current_points else null end,
    'point_balance_after', case when v_point_used_amount > 0 then v_point_balance_after else null end,
    'point_ledger_id', case when v_point_used_amount > 0 then v_point_ledger_id else null end,
    'inventory_deducted_count', v_inventory_deducted_count,
    'inventory_skipped_count', v_inventory_skipped_count
  );
end;
$$;

comment on function public.submit_customer_order_with_points(jsonb, integer, text, text, text) is
  '고객 주문 저장, 포인트 사용 차감, 등록상품 재고 자동 차감, 재고 이력 저장을 하나의 DB 트랜잭션으로 처리하는 RPC.';

commit;
